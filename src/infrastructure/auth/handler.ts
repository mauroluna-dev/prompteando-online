import { Auth } from "@auth/core";
import { authConfig } from "./auth-config";

export const handleAuth = (request: Request) => Auth(request, authConfig);
