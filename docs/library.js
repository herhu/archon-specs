document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.getElementById("libraryGrid");

  try {
    const response = await fetch("/v1/library/generations");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const generations = await response.json();
    grid.innerHTML = ""; // clear loading state

    if (!generations || generations.length === 0) {
      grid.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 64px 20px;">
          <h2 class="card-title" style="margin-bottom: 12px;">No Projects Yet</h2>
          <p style="color: var(--muted); margin: 0;">Be the first to generate a public project using the free tier!</p>
        </div>
      `;
      return;
    }

    generations.forEach((gen) => {
      const card = document.createElement("div");
      card.className = "card";
      card.onclick = () => openDiagram(gen.id);

      const date = new Date(gen.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      const name = gen.meta?.specName || "Untitled Architecture";
      const durationSecs = ((gen.duration_ms || 0) / 1000).toFixed(1);

      card.innerHTML = `
        <div class="card-header">
          <h3 class="card-title">${escapeHtml(name)}</h3>
          <span style="font-size: 11px; opacity: 0.5; font-family: var(--font-mono);">${date}</span>
        </div>
        
        <p style="color: var(--text-secondary); margin: 0; line-height: 1.5;">
          A fully validated, docker-ready NestJS backend generated deterministically through the Archon Control Plane.
        </p>

        <div class="card-meta">
          <div class="pill">
            <i>⚡</i> ${durationSecs}s
          </div>
          <div class="pill">
            <i style="color: #00ff00;">✔</i> Verified
          </div>
          <div class="pill" style="opacity: 0.6;">
            ID: ${gen.id.substring(0, 8)}
          </div>
        </div>

        <div style="display: flex; gap: 12px; margin-top: auto; padding-top: 24px; border-top: 1px solid var(--border-subtle);">
          <button class="pill" onclick="event.stopPropagation(); openDiagram('${gen.id}')" style="flex: 1; justify-content: center; cursor: pointer;">
            View Blueprint
          </button>
          <a href="/v1/library/generations/${gen.id}/download" class="pill" onclick="event.stopPropagation()" style="flex: 1; justify-content: center; background: var(--text-primary); color: var(--bg-primary); text-decoration: none; border-color: var(--text-primary);">
            Download API
          </a>
        </div>
      `;

      grid.appendChild(card);
    });
  } catch (error) {
    console.error("Failed to load library:", error);
    grid.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; text-align: center; border-color: #ff5c00;">
        <h3 class="card-title" style="color: #ff5c00;">Failed to Load Projects</h3>
        <p style="color: var(--text-secondary);">We encountered an error fetching the generated backend components. Please try again later.</p>
      </div>
    `;
  }
});

// Simple HTML escaping to prevent XSS
function escapeHtml(unsafe) {
  return (unsafe || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- Diagrams ---
let currentPanZoom = null;

async function openDiagram(genId) {
  const modal = document.getElementById("diagramModal");
  modal.style.display = "";
  modal.classList.remove("hidden");
  modal.classList.add("active");
  document.body.style.overflow = "hidden";

  const container = document.getElementById("mermaidContainer");
  const loading = document.getElementById("diagramLoading");
  const errorDiv = document.getElementById("diagramError");
  const errorMsg = document.getElementById("diagramErrorMsg");

  loading.style.display = "flex";
  errorDiv.style.display = "none";
  container.innerHTML = "";
  
  if (currentPanZoom) {
    currentPanZoom.destroy();
    currentPanZoom = null;
  }

  try {
    const res = await fetch(`/v1/library/generations/${genId}/diagram?type=class`);
    if (!res.ok) throw new Error("Failed to generate diagram");

    const data = await res.json();
    if (!data.diagram) throw new Error("No diagram content");

    if (window.mermaid) {
      const id = `mermaid-lib-${Date.now()}`;
      const mermaidBlocks = [...(data.diagram || "").matchAll(/```mermaid\n([\s\S]*?)\n```/g)].map(m => m[1]);
      const pureMermaidDSL = mermaidBlocks[0] || data.diagram;
      
      const { svg } = await window.mermaid.render(id, pureMermaidDSL);
      container.innerHTML = svg;

      const svgElement = container.querySelector("svg");
      if (svgElement) {
        svgElement.style.width = "100%";
        svgElement.style.height = "100%";
        svgElement.style.maxWidth = "none";

        setTimeout(() => {
          currentPanZoom = svgPanZoom(svgElement, {
            zoomEnabled: true,
            controlIconsEnabled: true,
            fit: true,
            center: true,
            minZoom: 0.05,
            maxZoom: 20,
            refreshRate: 'auto'
          });
        }, 50);
      }
    }
  } catch (e) {
    errorDiv.style.display = "block";
    errorMsg.textContent = e.message;
  } finally {
    loading.style.display = "none";
  }
}

window.closeDiagramModal = function() {
  const modal = document.getElementById("diagramModal");
  modal.classList.remove("active");
  modal.style.display = "";
  document.body.style.overflow = "";
  
  const container = document.getElementById("mermaidContainer");
  container.innerHTML = "";
  if (currentPanZoom) {
    currentPanZoom.destroy();
    currentPanZoom = null;
  }
};

