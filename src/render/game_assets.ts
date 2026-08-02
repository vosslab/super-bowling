import type { PinAssets } from "./pins";

export type GameAssets = PinAssets & { ball: CanvasImageSource };

export type AssetLoadState =
  | { status: "loading" }
  | { status: "ready"; assets: GameAssets }
  | { status: "failed"; message: string };

const asset_urls = {
  // Document-relative URLs work from the GitHub Pages project path and benchmark page alike.
  upright: "./assets/pin_upright.svg",
  fallen: "./assets/pin_fallen.svg",
  ball: "./assets/ball_surface.svg",
} as const;

function load_image(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  const ready = new Promise<HTMLImageElement>((resolve, reject) => {
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error(`Could not load renderer asset: ${url}`)),
      { once: true },
    );
  });
  image.src = url;
  return ready;
}

export function get_game_asset_urls(): typeof asset_urls {
  return asset_urls;
}

export async function load_game_assets(): Promise<GameAssets> {
  const [upright, fallen, ball] = await Promise.all([
    load_image(asset_urls.upright),
    load_image(asset_urls.fallen),
    load_image(asset_urls.ball),
  ]);
  return { upright, fallen, ball };
}
