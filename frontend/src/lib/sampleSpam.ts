export const samples = [
  {
    brand: "Bajaj Finance",
    header: "BAJAJF",
    text: "Your pre-approved loan offer is ready.",
  },
  {
    brand: "Swiggy",
    header: "SWIGGY",
    text: "Your dinner offer expires tonight.",
  },
  {
    brand: "Airtel",
    header: "AIRTEL",
    text: "Upgrade your plan for exclusive offers.",
  },
];
export function sampleImage(i: number) {
  const sample = samples[i],
    canvas = document.createElement("canvas");
  canvas.width = 760;
  canvas.height = 420;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");
  ctx.fillStyle = "#eff3f8";
  ctx.fillRect(0, 0, 760, 420);
  ctx.fillStyle = "#172943";
  ctx.fillRect(0, 0, 760, 90);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText("Messages    /    AD-" + sample.header + "-P", 32, 56);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(26, 128, 708, 182);
  ctx.fillStyle = "#182942";
  ctx.fillText(sample.brand, 50, 180);
  ctx.font = "24px sans-serif";
  ctx.fillText(sample.text, 50, 236);
  ctx.font = "18px sans-serif";
  ctx.fillText("Illustrative promotional message for demonstration", 32, 372);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}
