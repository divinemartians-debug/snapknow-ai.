
export const config = {
  maxDuration: 60
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Only POST requests are allowed."
    });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "The AI API key is missing. Check Vercel Environment Variables."
    });
  }

  const { image, question, previousAnswer } = req.body || {};

  if (typeof image !== "string" ||
      !/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(image)) {
    return res.status(400).json({
      error: "Please upload a valid JPEG, PNG, WEBP, or GIF image."
    });
  }

  // Keep uploads small enough for serverless request limits.
  if (image.length > 4000000) {
    return res.status(413).json({
      error: "Photo too large. Choose an image under about 3 MB."
    });
  }

  if (typeof question !== "string" || !question.trim()) {
    return res.status(400).json({
      error: "Please enter a question about your photo."
    });
  }

  try {
    let prompt = question.trim().slice(0, 4000);

    if (typeof previousAnswer === "string" && previousAnswer.trim()) {
      prompt =
        "Previous answer for context:\n" +
        previousAnswer.slice(0, 3000) +
        "\n\nNew question or instruction:\n" +
        prompt;
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "SnapKnow AI"
        },
        body: JSON.stringify({
          model: "nvidia/nemotron-3.5-super-vl:free",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    "You are SnapKnow AI, a helpful visual learning " +
                    "assistant. Analyze the supplied picture carefully. " +
                    "Explain visible objects clearly, distinguish facts " +
                    "from guesses, and admit uncertainty. Be friendly, " +
                    "accurate, and easy to understand.\n\n" +
                    prompt
                },
                {
                  type: "image_url",
                  image_url: {
                    url: image
                  }
                }
              ]
            }
          ],
          max_tokens: 700,
          temperature: 0.3
        })
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("OpenRouter request failed:", response.status);

      return res.status(502).json({
        error:
          data?.error?.message ||
          "The AI service is temporarily unavailable. Please try again."
      });
    }

    const content = data?.choices?.[0]?.message?.content;

    const answer = typeof content === "string"
      ? content.trim()
      : Array.isArray(content)
        ? content
            .filter(part => part.type === "text")
            .map(part => part.text || "")
            .join("\n")
            .trim()
        : "";

    if (!answer) {
      return res.status(502).json({
        error: "The AI returned no answer. Please try again."
      });
    }

    return res.status(200).json({ answer });

  } catch (error) {
    console.error("SnapKnow API error:", error.message);

    return res.status(500).json({
      error: "Could not contact the AI service. Please try again."
    });
  }
                  }
