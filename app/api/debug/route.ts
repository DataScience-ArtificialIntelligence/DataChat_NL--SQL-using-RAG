export async function GET() {
  return Response.json({
    GROQ_API_KEY: process.env.GROQ_API_KEY ?? "NOT LOADED"
  });
}
