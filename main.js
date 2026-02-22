import chalk from "chalk";
import React from "react";
import { render } from "ink";
import { initDb, formatVolume, getDb } from "./data/data.js";
import App from "./ui/app.jsx";

const main = async () => {
  await initDb();
  const { fat } = getDb();
  if (fat.count() === 0) formatVolume({ totalClusters: 256, clusterSize: 64 });

  render(React.createElement(App));
};

main();
