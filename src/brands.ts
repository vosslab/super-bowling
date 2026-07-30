declare const player_id_brand: unique symbol;
declare const pin_id_brand: unique symbol;

export type PlayerId = number & { readonly [player_id_brand]: "PlayerId" };
export type PinId = number & { readonly [pin_id_brand]: "PinId" };

export function create_player_id(value: number): PlayerId {
  return value as PlayerId;
}

export function create_pin_id(value: number): PinId {
  return value as PinId;
}
