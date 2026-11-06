
import axios from "axios";
import readline from "node:readline/promises";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const apiKey = await rl.question("NVIDIA API key: ");
rl.close();

try {
  const response = await axios.post(
    "https://integrate.api.nvidia.com/v1/chat/completions",
    {
      model: "minimaxai/minimax-m3.1-flash",
      messages: [
        { role: "user", content: "Say hello in one sentence." }
      ],
      max_tokens: 128,
      stream: true,
      temperature: 1,
      top_p: 0.95
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream"
      },
      responseType: "stream",
      timeout: 300000
    }
  );

  response.data.on("data", chunk => {
    process.stdout.write(chunk.toString());
  });

  response.data.on("end", () => {
    console.log("\nStream finished.");
  });

  response.data.on("error", error => {
    console.error("Stream error:", error.message);
  });

} catch (error) {
  console.error("Request failed:", error.message);
  console.error("HTTP status:", error.response?.status);
  console.error("Response:", error.response?.data);
}
