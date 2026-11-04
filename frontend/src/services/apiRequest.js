export function createApiRequest({
  apiBaseUrl = "",
  fetchImplementation = fetch,
  onUnauthorized = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("auth:session-expired"));
    }
  },
} = {}) {
  return async function request(path, { token: _token, ...options } = {}) {
    let response;
    try {
      response = await fetchImplementation(`${apiBaseUrl}${path}`, {
        ...options,
        credentials: "include",
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
        },
      });
    } catch {
      throw new Error("Unable to reach the server. Check your connection and try again.");
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error?.message || "The request could not be completed.");
      error.status = response.status;
      if (
        response.status === 401 &&
        path !== "/api/auth/login" &&
        path !== "/api/auth/register"
      ) {
        onUnauthorized();
      }
      throw error;
    }
    return body;
  };
}
