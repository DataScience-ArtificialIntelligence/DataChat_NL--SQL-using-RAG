const res = await fetch("http://127.0.0.1:11434/api/embed", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "nomic-embed-text",
    input: "hello world"
  })
});

console.log("Status:", res.status);
console.log(await res.text());
