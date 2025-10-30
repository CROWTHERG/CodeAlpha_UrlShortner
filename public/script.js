const form = document.getElementById("urlForm");
const resultDiv = document.getElementById("result");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const longUrl = document.getElementById("longUrl").value.trim();

  const res = await fetch("/shorten", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: longUrl }),
  });

  const data = await res.json();
  if (data.shortUrl) {
    resultDiv.innerHTML = `✅ Short URL: <a href="${data.shortUrl}" target="_blank">${data.shortUrl}</a>`;
  } else {
    resultDiv.textContent = "❌ Error shortening URL.";
  }
});