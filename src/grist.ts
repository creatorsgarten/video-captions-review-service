import { GristDocAPI } from "grist-api";

export const grist = new GristDocAPI(Bun.env["GRIST_DOC_URL"]!);
