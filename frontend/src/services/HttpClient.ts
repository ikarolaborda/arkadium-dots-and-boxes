/*
 * Thin HTTP client. Wraps fetch so the rest of the app never sees raw
 * Response handling and so all requests share one error-shape contract.
 * Substituting it with a different transport later is a one-class change.
 */
export class HttpClient {
  constructor(private readonly baseUrl: string) {}

  public async get<T>(path: string, token?: string): Promise<T> {
    return this.request<T>('GET', path, undefined, token);
  }

  public async post<T>(path: string, body: unknown, token?: string): Promise<T> {
    return this.request<T>('POST', path, body, token);
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    token: string | undefined,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token !== undefined) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }
}

export const httpClient = new HttpClient('/api');
