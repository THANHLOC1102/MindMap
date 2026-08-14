import { parseQuery } from "./lib/queryParser.js";

const queries = [
  "q1 q2 q3 hcm",
  "Q1 Q2 Q3 HCM",
  "khách sạn q1 q2 q3 hcm",
];

for (const q of queries) {
  console.log(q, "=>", parseQuery(q));
}
