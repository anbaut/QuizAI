import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// 🚨 Vérifie bien le nom du modèle dans LM Studio
const LM_MODEL = "mistral-7b-instruct-v0.3"; // ex: "mistral-7b-instruct"

const LM_URL = "http://localhost:1234/v1/chat/completions";

app.post("/api/question", async (req, res) => {
  const { category, difficulty } = req.body;

  const prompt = `
Tu es un générateur de questions pour un jeu.

Catégorie : ${category}
Difficulté : ${difficulty}

Règles :
- Une seule question
- Langue : français
- Si difficulté = Facile ou Moyen → QCM
- Si difficulté = Difficile → réponse libre
- Pas d'explications
- Pas de texte autour du JSON

Réponds STRICTEMENT au format JSON suivant :

{
  "question": "string",
  "type": "qcm" ou "text",
  "choices": ["string"],
  "answer": "string"
}
`;

  try {
    const response = await fetch(LM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LM_MODEL,
        messages: [
          { role: "system", content: "Tu es un assistant de jeu qui génère des questions." },
          { role: "user", content: prompt }
        ],
        temperature: 0.8
      })
    });

    const data = await response.json();

    // ✅ Sécurisation JSON : on retire les ```json ``` éventuels
    let content = data.choices?.[0]?.message?.content || "";
    content = content.replace(/```json/g, "").replace(/```/g, "").trim();

    const parsed = JSON.parse(content);
    res.json(parsed);

  } catch (err) {
    console.error("❌ Erreur IA :", err);
    res.status(500).json({ error: "Erreur génération IA" });
  }
});

app.listen(3000, () => {
  console.log("✅ Backend LM Studio prêt sur http://localhost:3000");
});
