export const dynamic = 'force-static'

export async function GET() {
  return new Response(JSON.stringify([1, 2, 3]), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "custom-header": "custom-value",
    },
  });
}
