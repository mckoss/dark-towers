/* <IOSDevice> — minimal phone frame for the mobile mockups.
   The original Claude Design frame component was not included in the handoff;
   this stand-in draws a 402×874 device shell (bezel, status bar, home indicator)
   and scrolls its children inside the screen. */
function IOSDevice(props) {
  const width = 402, height = 874;
  return React.createElement(
    "div",
    { style: { width: width + 24, height: height + 24, padding: 12, background: "#201e1d", borderRadius: 56, boxShadow: "0 12px 40px rgba(32,30,29,0.25)", flex: "none" } },
    React.createElement(
      "div",
      { style: { position: "relative", width, height, background: "#f3f2f2", borderRadius: 44, overflow: "hidden", fontFamily: '"Archivo", system-ui, sans-serif' } },
      // status bar
      React.createElement(
        "div",
        { style: { position: "absolute", top: 0, left: 0, right: 0, height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 30px", fontSize: 15, fontWeight: 700, color: "#201e1d", zIndex: 20, pointerEvents: "none" } },
        React.createElement("span", { style: { fontVariantNumeric: "tabular-nums" } }, "9:41"),
        React.createElement("span", { style: { position: "absolute", left: "50%", top: 12, width: 124, height: 36, marginLeft: -62, background: "#201e1d", borderRadius: 20 } }),
        React.createElement("span", { style: { letterSpacing: "0.05em" } }, "●●● ▲ ▮")
      ),
      // screen
      React.createElement(
        "div",
        { style: { position: "absolute", inset: 0, overflowY: "auto", overflowX: "hidden", scrollbarWidth: "none" } },
        props.children
      ),
      // home indicator
      React.createElement("div", { style: { position: "absolute", bottom: 8, left: "50%", width: 140, height: 5, marginLeft: -70, background: "#201e1d", borderRadius: 3, zIndex: 20, pointerEvents: "none" } })
    )
  );
}
window.IOSDevice = IOSDevice;
