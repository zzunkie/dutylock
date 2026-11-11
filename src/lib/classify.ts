import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { fullDescription, getLine, search, subtree, htsMeta, type HtsLine } from "./hts";

// The classification agent. Claude reads the seller's listing, explores the real tariff schedule
// through tools, and submits every code customs could plausibly apply. It never states a rate:
// rates, duties and the hold are computed in code from the schedule (see quote.ts).

export const MODEL = "claude-opus-5-5";

export type ListingInput = {
  title: string;
  description: string;
  materials: string;
  origin: string; // ISO country code
  value: number; // USD per unit, customs value
  quantity: number;
  weightKg: number;
};

export type Candidate = {
  hts: string;
  role: "most_likely" | "plausible_alternative";
  likelihood: "high" | "medium" | "low";
  reasoning: string;
  decidingFact: string;
};

export type Classification = {
  summary: string;
  keyFacts: Array<{ fact: string; source: "listing" | "assumption" }>;
  candidates: Candidate[];
  questionsForSeller: string[];
  model: string;
  classifiedAt: string;
};

export type AgentEvent =
  | { type: "step"; label: string; detail?: string }
  | { type: "done"; classification: Classification }
  | { type: "error"; message: string };

const SYSTEM = `You are a licensed-customs-broker-grade tariff classification assistant for small overseas sellers who ship single parcels to US consumers.

Your job: given a product listing, find every 10-digit HTSUS statistical line that US Customs and Border Protection could reasonably apply to it, and say which is most likely. A seller will hold the highest of these duties on the buyer's PayPal payment and charge only what customs actually assesses, so missing a plausible alternative costs the seller money, and listing an implausible one costs the buyer a needlessly large hold. Be precise about both.

How to work:
- Use the tools to read the actual schedule. Never rely on memory for a code or a rate: confirm every code you submit with get_hts_line or browse_hts.
- Classify by the General Rules of Interpretation (GRI 1 first: heading texts and section/chapter notes; GRI 3(b) essential character for composite goods and sets; GRI 6 for subheadings). Value-based or set-based subheadings ("valued not over $X per dozen", "available in specified sets") matter: work them out from the listing's value and contents.
- Typical ambiguities to examine: porcelain vs stoneware vs earthenware (body, vitrification, translucency), knitted vs woven, outer-surface material for bags (leather vs textile vs plastics-coated), fiber content by weight, whether a decorative article is a lighting fitting, an ornament, or an article of base metal.
- A plausible alternative is a code a reasonable customs officer could choose from the facts in the listing. Include at most 4 candidates in total, exactly one marked most_likely.
- Use only facts from the listing; when you must assume something, say so in key_facts with source "assumption", and add a short question that would settle it.
- Finish by calling submit_classification exactly once. Write all text in plain English for a small business owner.`;

const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_hts",
    description:
      "Keyword search over the US Harmonized Tariff Schedule (chapters for handmade and consumer goods). Returns codes with their full description path and general (MFN) duty rate text. Use several searches with different terms (material, function, construction).",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Keywords, e.g. 'porcelain tableware tea set'" } },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "browse_hts",
    description:
      "List every line under a heading or subheading prefix (e.g. '6911', '4202.92'), in schedule order with indentation, so you can read the sibling options and value/set conditions.",
    input_schema: {
      type: "object",
      properties: { prefix: { type: "string", description: "4- to 8-digit prefix, e.g. '6912.00'" } },
      required: ["prefix"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "get_hts_line",
    description: "Read one line in full: description path, general rate (with the line it is inherited from), units and footnotes.",
    input_schema: {
      type: "object",
      properties: { code: { type: "string", description: "e.g. '6912.00.39.10'" } },
      required: ["code"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "submit_classification",
    description: "Submit the final classification. Call exactly once, after confirming every code with the other tools.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One or two sentences: what the article is for customs purposes." },
        key_facts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fact: { type: "string" },
              source: { type: "string", enum: ["listing", "assumption"] },
            },
            required: ["fact", "source"],
            additionalProperties: false,
          },
        },
        candidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              hts: { type: "string", description: "10-digit statistical line, e.g. 6912.00.39.10" },
              role: { type: "string", enum: ["most_likely", "plausible_alternative"] },
              likelihood: { type: "string", enum: ["high", "medium", "low"] },
              reasoning: { type: "string", description: "Why customs could choose this line, citing the GRI and the heading/note text." },
              deciding_fact: { type: "string", description: "The single fact that would make customs choose this line." },
            },
            required: ["hts", "role", "likelihood", "reasoning", "deciding_fact"],
            additionalProperties: false,
          },
        },
        questions_for_seller: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "key_facts", "candidates", "questions_for_seller"],
      additionalProperties: false,
    },
    strict: true,
  },
];

function lineView(l: HtsLine) {
  return {
    code: l.code,
    description: fullDescription(l),
    general_rate: l.general || "(none on this line)",
    rate_from: l.generalSource,
    leaf: l.isLeaf,
  };
}

function runTool(name: string, input: Record<string, string>): { result: unknown; label: string } {
  if (name === "search_hts") {
    const hits = search(input.query, 20);
    return { label: `Searched the tariff schedule for “${input.query}”`, result: hits.map(lineView) };
  }
  if (name === "browse_hts") {
    const rows = subtree(input.prefix, 90);
    return {
      label: `Read every line under ${input.prefix}`,
      result: rows.map((l) => `${"  ".repeat(l.indent)}${l.code || "-"} ${l.description} | ${l.general ? `rate ${l.general}` : ""}`).join("\n") || "No lines under that prefix.",
    };
  }
  if (name === "get_hts_line") {
    const l = getLine(input.code);
    return {
      label: `Checked ${input.code}`,
      result: l ? { ...lineView(l), units: l.units, footnotes: l.footnotes } : `No line ${input.code} in the loaded chapters (${htsMeta().chapters.join(", ")}).`,
    };
  }
  return { label: name, result: `Unknown tool ${name}` };
}

type RawSubmission = {
  summary: string;
  key_facts: Array<{ fact: string; source: "listing" | "assumption" }>;
  candidates: Array<{ hts: string; role: Candidate["role"]; likelihood: Candidate["likelihood"]; reasoning: string; deciding_fact: string }>;
  questions_for_seller: string[];
};

/** Hard validation in code: every code must exist in the schedule, exactly one most_likely, at most four. */
function validate(sub: RawSubmission): string | null {
  if (!sub.candidates?.length) return "Submit at least one candidate.";
  if (sub.candidates.length > 4) return "Submit at most 4 candidates.";
  const most = sub.candidates.filter((c) => c.role === "most_likely");
  if (most.length !== 1) return "Mark exactly one candidate as most_likely.";
  for (const c of sub.candidates) {
    const l = getLine(c.hts);
    if (!l) return `${c.hts} is not a line in the schedule. Confirm codes with get_hts_line.`;
    if (!l.general) return `${c.hts} has no duty rate on its line or its parents; choose the statistical line under it.`;
  }
  return null;
}

export async function* classify(listing: ListingInput): AsyncGenerator<AgentEvent> {
  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Classify this product for US import.

Title: ${listing.title}
Country of origin: ${listing.origin}
Customs value: $${listing.value.toFixed(2)} per unit, quantity ${listing.quantity}
Shipping weight: ${listing.weightKg} kg
Materials and construction: ${listing.materials}
Listing description: ${listing.description}`,
    },
  ];

  yield { type: "step", label: "Reading the listing" };

  for (let turn = 0; turn < 14; turn++) {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "high" },
        cache_control: { type: "ephemeral" },
        system: SYSTEM,
        tools,
        messages,
      });
    } catch (e) {
      const msg = e instanceof Anthropic.APIError ? `Claude API error ${e.status}` : "Could not reach Claude";
      yield { type: "error", message: msg };
      return;
    }

    if (response.stop_reason === "refusal") {
      yield { type: "error", message: "The model declined this listing." };
      return;
    }
    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason === "pause_turn") continue;

    const uses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (!uses.length) {
      messages.push({ role: "user", content: "Please finish by calling submit_classification." });
      continue;
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    let submitted: Classification | null = null;
    for (const use of uses) {
      const input = use.input as Record<string, unknown>;
      if (use.name === "submit_classification") {
        const sub = input as unknown as RawSubmission;
        const problem = validate(sub);
        if (problem) {
          yield { type: "step", label: "Rechecking a code", detail: problem };
          results.push({ type: "tool_result", tool_use_id: use.id, content: problem, is_error: true });
          continue;
        }
        submitted = {
          summary: sub.summary,
          keyFacts: sub.key_facts,
          candidates: sub.candidates.map((c) => ({
            hts: getLine(c.hts)!.code,
            role: c.role,
            likelihood: c.likelihood,
            reasoning: c.reasoning,
            decidingFact: c.deciding_fact,
          })),
          questionsForSeller: sub.questions_for_seller,
          model: response.model,
          classifiedAt: new Date().toISOString(),
        };
        results.push({ type: "tool_result", tool_use_id: use.id, content: "Recorded." });
      } else {
        const { label, result } = runTool(use.name, input as Record<string, string>);
        yield { type: "step", label };
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      }
    }
    messages.push({ role: "user", content: results });
    if (submitted) {
      yield { type: "done", classification: submitted };
      return;
    }
  }
  yield { type: "error", message: "Classification did not finish in time." };
}
