import { random } from "@heswell/service-utils";

export const getRandomPriceChange = () =>
  (random(1, 4) / 1000) * (random(0, 1) > 0.5 ? 1 : -1);
