export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#0e0e0e",
        color: "#f5f5f5",
        fontFamily: "ui-monospace, Menlo, monospace",
        padding: "2rem",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#f05a5a", marginBottom: "0.75rem" }}>404</p>
        <p style={{ letterSpacing: "0.12em", textTransform: "uppercase" }}>
          /warp // page not found
        </p>
        <a
          href="/"
          style={{
            display: "inline-block",
            marginTop: "1.5rem",
            color: "#f05a5a",
            textDecoration: "none",
            borderBottom: "1px solid #f05a5a",
          }}
        >
          back to /
        </a>
      </div>
    </main>
  );
}
