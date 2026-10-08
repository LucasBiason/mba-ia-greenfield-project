import { handlers as authHandlers } from "./auth";
import { handlers as seedHandlers } from "./_seed";
import { handlers as videoHandlers } from "./videos";

export const handlers = [...authHandlers, ...seedHandlers, ...videoHandlers];
