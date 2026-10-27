export function beerShareSummary(game) {
  const final = game.phase === "result" && game.result;
  const rounds = final ? game.result.rounds : game.roundResult ? [game.roundResult] : [];
  if (!rounds.length) return null;
  const score = final ? game.result.value : rounds[0].score;
  const spilledMl = Math.round(rounds.reduce((sum, r) => sum + r.spilled, 0) * 500);
  const penalty = Math.round(rounds.reduce((sum, r) => sum + r.spillPenalty, 0));
  const label = final ? "세 손님 최종 결과" : `손님 ${rounds[0].round + 1} · ${game.order.name}`;
  const text = `맥주 잘 따르기 🍺\n${label}\n${final ? "평균 " : ""}${score}점 · 흘린 맥주 ${spilledMl}mL · ${final ? "누적 " : ""}넘침 감점 −${penalty}점\n나보다 깔끔하게 따를 수 있나요?`;
  return { final: !!final, score, spilledMl, penalty, label, text };
}
