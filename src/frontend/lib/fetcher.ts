export const fetcher = async <T = unknown>(url: string): Promise<T | null> => {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) return null;
  return (await res.json()) as T;
};
