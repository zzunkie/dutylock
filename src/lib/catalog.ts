import type { ListingInput } from "./classify";

// Demo storefront: three small makers outside the US whose products sit on real classification fault lines.
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

export const PRODUCTS: Product[] = [
  {
    id: "celadon-tea-set",
    maker: "Kiln Hoshino",
    place: "Arita, Saga",
    originName: "Japan",
    tagline: "Is it porcelain or stoneware? Customs decides, and the duty swings from 0.7% to 26%.",
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
    id: "waxed-weekender",
    maker: "Harrow & Finch",
    place: "Leeds",
    originName: "United Kingdom",
    tagline: "Waxed cotton or leather on the outside? The outer surface sets the duty.",
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
    tagline: "A lighting fitting, an ornament, or an article of brass? Three readings, three rates.",
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

export const getProduct = (id: string) => PRODUCTS.find((p) => p.id === id);
