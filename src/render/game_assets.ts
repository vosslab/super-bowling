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

const asset_raster_sizes = {
  upright: { width: 160, height: 504 },
  fallen: { width: 504, height: 160 },
  ball: { width: 240, height: 360 },
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

function rasterize_image(
  image: HTMLImageElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Canvas asset rasterization is unavailable.");
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

export function get_game_asset_urls(): typeof asset_urls {
  return asset_urls;
}

export async function load_game_assets(): Promise<GameAssets> {
  const [upright_source, fallen_source, ball_source] = await Promise.all([
    load_image(asset_urls.upright),
    load_image(asset_urls.fallen),
    load_image(asset_urls.ball),
  ]);
  const upright = rasterize_image(
    upright_source,
    asset_raster_sizes.upright.width,
    asset_raster_sizes.upright.height,
  );
  const fallen = rasterize_image(
    fallen_source,
    asset_raster_sizes.fallen.width,
    asset_raster_sizes.fallen.height,
  );
  const ball = rasterize_image(
    ball_source,
    asset_raster_sizes.ball.width,
    asset_raster_sizes.ball.height,
  );
  return { upright, fallen, ball };
}
