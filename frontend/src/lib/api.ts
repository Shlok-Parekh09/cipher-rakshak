import type {
  AnalyzeInput,
  Directory,
  DispatchInput,
  EscalateInput,
  Health,
  Notice,
  RequestPage,
  Settings,
  UpdateInput,
} from "../types/cipher_rakshak";

export const defaults: Settings = {
  endpoint: process.env.NEXT_PUBLIC_API_URL || "",
  safe: true,
  recipient: process.env.NEXT_PUBLIC_DEMO_RECIPIENT || "",
};

export function endpoint(input: string) {
  if (!input)
    throw new Error("Set the deployed API URL in connection settings.");
  const url = new URL(input);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new Error("Use an HTTPS API URL.");
  return url.origin;
}

export function client(settings: Settings, token: string) {
  async function call<T>(
    path: string,
    method = "GET",
    body?: unknown,
    auth = true,
  ): Promise<T> {
    if (auth && !token)
      throw new Error("Sign in to your verified citizen account.");
    const response = await fetch(endpoint(settings.endpoint) + "/api/" + path, {
      method,
      cache: "no-store",
      headers: {
        ...(auth ? { Authorization: "Bearer " + token } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(32000),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.error || data.message || "Request failed. Refresh and try again.",
      );
    return data;
  }
  return {
    health: () => call<Health>("health", "GET", undefined, false),
    directory: () => call<Directory>("directory", "GET", undefined, false),
    analyze: (body: AnalyzeInput) => call<Notice>("analyze", "POST", body),
    dispatch: (body: DispatchInput) => call<Notice>("dispatch", "POST", body),
    track: (cursor?: Record<string, string>) =>
      call<RequestPage>(
        "requests" +
          (cursor
            ? "?cursor=" + encodeURIComponent(JSON.stringify(cursor))
            : ""),
      ),
    update: (id: string, body: UpdateInput) =>
      call<Notice>("requests/" + encodeURIComponent(id), "PATCH", body),
    escalate: (body: EscalateInput) => call<Notice>("escalate", "POST", body),
  };
}

export async function account(
  mode: "signin" | "signup" | "confirm",
  email: string,
  secret: string,
) {
  const region = process.env.NEXT_PUBLIC_AWS_REGION,
    ClientId = process.env.NEXT_PUBLIC_CLIENT_ID;
  if (!region || !ClientId)
    throw new Error(
      "Configure the Cognito region and app client at build time.",
    );
  const action = {
    signin: "InitiateAuth",
    signup: "SignUp",
    confirm: "ConfirmSignUp",
  }[mode];
  const payload =
    mode === "signin"
      ? {
          ClientId,
          AuthFlow: "USER_PASSWORD_AUTH",
          AuthParameters: { USERNAME: email, PASSWORD: secret },
        }
      : mode === "confirm"
        ? { ClientId, Username: email, ConfirmationCode: secret }
        : {
            ClientId,
            Username: email,
            Password: secret,
            UserAttributes: [{ Name: "email", Value: email }],
          };
  const r = await fetch("https://cognito-idp." + region + ".amazonaws.com/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService." + action,
    },
    body: JSON.stringify(payload),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.message || "Account request failed.");
  if (mode === "signin" && !result.AuthenticationResult?.IdToken)
    throw new Error("Sign-in requires account administrator assistance.");
  return String(result.AuthenticationResult?.IdToken || "");
}

export async function compress(file: Blob): Promise<string> {
  if (file.size > 24 * 1024 * 1024)
    throw new Error("Select an image smaller than 24 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image conversion unavailable.");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.5]) {
      const base64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];
      if (base64.length < 1900000) return base64;
    }
    throw new Error("Crop the screenshot and retry.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
