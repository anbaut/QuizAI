const generateBtn = document.getElementById("generate");
const questionBox = document.getElementById("question-box");
const questionEl = document.getElementById("question");
const answersEl = document.getElementById("answers");
const solutionEl = document.getElementById("solution");
const showAnswerBtn = document.getElementById("show-answer");

generateBtn.onclick = async () => {
  solutionEl.classList.add("hidden");
  answersEl.innerHTML = "";

  const category = document.getElementById("category").value;
  const difficulty = document.getElementById("difficulty").value;

  const res = await fetch("http://localhost:3000/api/question", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, difficulty })
  });

  const data = await res.json();

  questionBox.classList.remove("hidden");
  questionEl.textContent = data.question;

  if (data.type === "qcm") {
    data.choices.forEach(choice => {
      const div = document.createElement("div");
      div.className = "choice";
      div.textContent = choice;
      answersEl.appendChild(div);
    });
  } else {
    const input = document.createElement("input");
    input.placeholder = "Votre réponse...";
    answersEl.appendChild(input);
  }

  solutionEl.textContent = "Réponse : " + data.answer;
};

showAnswerBtn.onclick = () => {
  solutionEl.classList.remove("hidden");
};
