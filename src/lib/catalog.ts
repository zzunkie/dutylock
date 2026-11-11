import type { ListingInput } from "./classify";

// Demo storefront: four small makers outside the US whose products sit on real classification fault lines.
// Makers and products are fictional.

export type Product = {
  id: string;
  maker: string;
  place: string;
  originName: string;
  tagline: string;
  accent: string; // CSS color for the product's illustration
  shipping: number;
  listing: ListingInput;
};

export const SHIPPING_EXPRESS = 28;

const ALL: Product[] = [
  {
    id: "celadon-tea-set",
    maker: "Kiln Hoshino",
    place: "Arita, Saga",
    originName: "Japan",
    tagline: "Porcelain or stoneware, Japan's 12.5% floor makes the duty the same either way, so nothing extra is held.",
    accent: "#7FA79A",
    shipping: SHIPPING_EXPRESS,
    listing: {
      title: "Seiji celadon tea set for two",
      origin: "JP",
      value: 168,
      quantity: 1,
      weightKg: 2.1,
      materials:
        "Five pieces: teapot (600 ml) with lid, two teacups, two saucers. High-fired clay body (kiln at about 1,280°C), pale celadon glaze. The body is white and slightly translucent at the thin rims; the foot rings are unglazed and show a fine, dense grain.",
      description:
        "Wheel-thrown and glazed by hand in our family kiln. Sold only as this set. Dishwasher safe, food safe, for everyday tea at home.",
    },
  },
  {
    id: "jute-espadrilles",
    maker: "Alpargatas Ebro",
    place: "La Rioja",
    originName: "Spain",
    tagline: "One fact decides 37.5% or 10%: does the rubber tread weigh 10% of the shoe?",
    accent: "#3F6E8C",
    shipping: SHIPPING_EXPRESS,
    listing: {
      title: "Hand-stitched jute-sole espadrilles",
      origin: "ES",
      value: 79,
      quantity: 1,
      weightKg: 0.7,
      materials:
        "Upper: 100% cotton canvas. Sole: braided jute rope with a thin vulcanized rubber tread layer glued to the bottom (about 2 mm, covers most of the ground-contact area). Hand-stitched upper-to-sole seam. Women's, closed toe, slip-on.",
      description: "Made by hand in our workshop in La Rioja, the traditional way: braided jute sole, sewn canvas upper.",
    },
  },
  {
    id: "waxed-weekender",
    maker: "Harrow & Finch",
    place: "Leeds",
    originName: "United Kingdom",
    tagline: "Waxed cotton or leather outside: 16.3% or 14.5%. If customs reads it as leather, the buyer gets the difference back.",
    accent: "#8A6A3F",
    shipping: SHIPPING_EXPRESS,
    listing: {
      title: "Waxed canvas weekender bag",
      origin: "GB",
      value: 185,
      quantity: 1,
      weightKg: 1.6,
      materials:
        "Body: 18 oz cotton canvas impregnated with a paraffin-based wax. Handles, base panel and edge trim: vegetable-tanned bridle leather, roughly 20% of the outer surface. Solid brass buckles, brass zip. Cotton twill lining. 45 litres.",
      description:
        "A two-night travel bag cut and stitched in our Leeds workshop. Detachable shoulder strap, interior zip pocket.",
    },
  },
  {
    id: "brass-candle-holder",
    maker: "Oficina Lume",
    place: "Porto",
    originName: "Portugal",
    tagline: "A brass lighting fitting at 10%, or copper household ware under the 50% Section 232 duty? The hold covers both.",
    accent: "#B8913A",
    shipping: SHIPPING_EXPRESS,
    listing: {
      title: "Hand-hammered brass taper candle holder",
      origin: "PT",
      value: 64,
      quantity: 1,
      weightKg: 0.6,
      materials:
        "Solid brass (copper-zinc alloy), hand-hammered and clear-lacquered. Holds one taper candle. 18 cm tall, weighted base. No electrical parts.",
      description: "Made one at a time on the bench in our Porto workshop. A table piece for dinner by candlelight.",
    },
  },
];

const ORDER = ["brass-candle-holder", "jute-espadrilles", "waxed-weekender", "celadon-tea-set"];
export const PRODUCTS: Product[] = ORDER.map((id) => ALL.find((p) => p.id === id)!).filter(Boolean);

export const getProduct = (id: string) => PRODUCTS.find((p) => p.id === id);
