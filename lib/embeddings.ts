export const runtime = "nodejs";

// lib/embeddings.ts
// Local embedding generation using Ollama (768-dim model: nomic-embed-text)

export async function embedText(text: string): Promise<number[]> {
  const model = "nomic-embed-text"; // 768 dimensions

  try {
    if (!text || text.trim().length === 0) {
      console.warn("[Embeddings] Skipping empty input");
      return [];
    }

    const res = await fetch("http://127.0.0.1:11434/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text }),
    });

    console.log("[Embeddings] Response status:", res.status);

    if (!res.ok) {
      console.error("[Embeddings] Ollama error:", {
        status: res.status,
        body: await res.text(),
      });
      return [];
    }

    const json = await res.json();
    console.log("[Embeddings] Response keys:", Object.keys(json));

    // Accept both possible formats from Ollama
    const embeddings =
      json.embeddings ??
      (json.embedding ? [json.embedding] : null);

    if (!embeddings || !Array.isArray(embeddings)) {
      console.error("[Embeddings] Invalid embedding format:", json);
      return [];
    }

    const vector = embeddings[0];

    if (!Array.isArray(vector)) {
      console.error("[Embeddings] Vector missing:", json);
      return [];
    }

    if (vector.length !== 768) {
      console.error("[Embeddings] Wrong vector dim:", {
        got: vector.length,
        expected: 768,
        text: text.substring(0, 100),
      });
      return [];
    }

    console.log(`[Embeddings] Success: ${vector.length} dims for "${text.substring(0, 50)}..."`)
    return vector;
  } catch (err) {
    console.error("[Embeddings] Failed:", err);
    return [];
  }
}
