import React from "react";
import { createRoot } from "react-dom/client";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import App from "./App.jsx";
import "./app.css";
import { installGlobalSounds } from "./lib/sound.js";

installGlobalSounds();

gsap.registerPlugin(useGSAP);

createRoot(document.getElementById("root")).render(<App />);
