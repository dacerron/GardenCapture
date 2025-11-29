export class LoadingOverlay {
  private container: HTMLElement;
  private root: HTMLDivElement;
  private spinner: HTMLDivElement;
  private label: HTMLDivElement;
  private hidden = false;

  constructor(container: HTMLElement) {
    this.container = container;

    const style = getComputedStyle(container);
    if (style.position === "static" || !style.position) {
      container.style.position = "relative";
    }

    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "absolute",
      inset: "0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "#000",
      transition: "opacity 320ms ease",
      opacity: "1",
      pointerEvents: "auto",
      zIndex: "10",
    });

    this.spinner = document.createElement("div");
    Object.assign(this.spinner.style, {
      width: "48px",
      height: "48px",
      border: "4px solid rgba(255,255,255,0.2)",
      borderTopColor: "#fff",
      borderRadius: "50%",
      animation: "loading-overlay-spin 1s linear infinite",
    });

    this.label = document.createElement("div");
    this.label.textContent = "Loading splats…";
    Object.assign(this.label.style, {
      marginTop: "14px",
      color: "#fff",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: "13px",
      letterSpacing: "0.4px",
      opacity: "0.85",
    });

    this.ensureKeyframes();

    this.root.appendChild(this.spinner);
    this.root.appendChild(this.label);
    this.container.appendChild(this.root);
  }

  show() {
    if (this.hidden) {
      this.hidden = false;
      this.root.style.opacity = "1";
      this.root.style.pointerEvents = "auto";
      if (!this.root.parentElement) {
        this.container.appendChild(this.root);
      }
    }
  }

  hide() {
    if (this.hidden) return;
    this.hidden = true;
    this.root.style.opacity = "0";
    this.root.style.pointerEvents = "none";
    const handle = () => {
      this.root.removeEventListener("transitionend", handle);
      if (this.root.parentElement === this.container) {
        this.container.removeChild(this.root);
      }
    };
    this.root.addEventListener("transitionend", handle);
    //just in case 
    window.setTimeout(handle, 400);
  }

  dispose() {
    this.hide();
  }

  private ensureKeyframes() {
    const id = "loading-overlay-spin-style";
    if (document.getElementById(id)) return;
    const styleEl = document.createElement("style");
    styleEl.id = id;
    styleEl.textContent = `
      @keyframes loading-overlay-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(styleEl);
  }
}
