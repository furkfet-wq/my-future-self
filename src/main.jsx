import React from "react";
import { createRoot } from "react-dom/client";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import Gate from "./Gate.jsx";
import "./app.css";
import { installGlobalSounds } from "./lib/sound.js";

installGlobalSounds();

gsap.registerPlugin(useGSAP);

createRoot(document.getElementById("root")).render(<Gate />);
