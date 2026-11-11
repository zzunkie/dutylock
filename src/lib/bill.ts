import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { MODEL } from "./classify";

// Reads the carrier's duties & taxes invoice (PDF or photo) the seller receives after customs clears the parcel.
// The model only transcribes; settle/route.ts checks the numbers against the quote before any money moves.

export const BillSchema = z.object({
  is_customs_duty_bill: z.boolean().describe("True only for a carrier or customs bill for import duties/taxes/fees."),
  carrier: z.string(),
  tracking_number: z.string().describe("Air waybill or tracking number exactly as printed, empty if absent"),
  entry_number: z.string().describe("CBP entry number if printed, else empty"),
  currency: z.string(),
  lines: z.array(
    z.object({
      description: z.string(),
      hts: z.string().describe("HTS code as printed, digits and dots"),
      customs_value: z.number(),
      duty: z.number().describe("Duty amount for this line, including any additional duty printed on it"),
    }),
  ),
  additional_duties: z.array(z.object({ label: z.string(), amount: z.number() })),
  fees: z.array(z.object({ label: z.string(), amount: z.number() })),
  total_due: z.number(),
  payer: z.string().describe("Who the bill is addressed to / who pays"),
  reader_notes: z
    .string()
    .describe(
      "Only problems with the document itself: illegible or missing fields, numbers that do not add up, signs of editing. Do not judge whether a duty legally applies. Empty if none.",
    ),
});

export type Bill = z.infer<typeof BillSchema>;

export async function readBill(file: { bytes: Buffer; mediaType: string }): Promise<Bill> {
  const client = new Anthropic();
  const data = file.bytes.toString("base64");
  const source =
    file.mediaType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
      : ({
          type: "image",
          source: { type: "base64", media_type: file.mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data },
        } as const);

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(BillSchema) },
    messages: [
      {
        role: "user",
        content: [
          source,
          {
            type: "text",
            text: "Transcribe this import duties bill. Copy numbers exactly as printed; do not compute or correct anything. If a value is missing, use an empty string or 0 and say so in reader_notes. US duty programs change often, so do not comment on whether a listed duty should apply; code checks the amounts against the order.",
          },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("Could not read this document.");
  }
  return response.parsed_output;
}
