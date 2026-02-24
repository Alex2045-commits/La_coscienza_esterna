import { safeFetch } from "./safeFetch.js";

export async function requireAdmin() {
  try {
    const res = await safeFetch("http://localhost:8000/api/me.php");
    if (!res.ok) return { status: "unauth" };

    const json = await res.json();

    if (json.id && json.role === "admin") {
      return { status: "ok", ...json };
    }

    return { status: "unauth" };
  } catch (e) {
    console.error("Errore check session admin:", e);
    return { status: "unauth" };
  }
}