export type Uuid = string & { readonly __brand: 'Uuid' };

export const isUuid = (value: string): value is Uuid =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const asUuid = (value: string): Uuid => {
  if (!isUuid(value)) {
    throw new Error(`Invalid UUID: ${value}`);
  }
  return value as Uuid;
};
