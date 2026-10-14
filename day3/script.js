let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const CATEGORIES = ["personal", "work", "study"];

// 1. Returns an array of notes whose text contains word, ignoring upper and lower case.
function searchNotes(word) {
  const search = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(search));
}

// 2. 	Returns the note object with the most characters, or null if there are no notes.
function longestNote() {
  if (notes.length === 0) return null;
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

// 3. Returns an object counting notes per category, such as { personal: 2, work: 1, study: 2 }.
function countByCategory() {
  const counts = { personal: 0, work: 0, study: 0 };
  notes.forEach((note) => {
    counts[note.category]++;
  });
  return counts;
}

// 4. Returns a sentence such as "5 notes: 2 personal, 1 work, 2 study."
function getSummary() {
  const counts = countByCategory();
  const word = notes.length === 1 ? "note" : "notes";
  return (
    `${notes.length} ${word}: ` +
    `${counts.personal} personal, ${counts.work} work, ${counts.study} study.`
  );
}

// 5. Returns true if a note with the same text already exists (ignoring case and extra spaces).
function isDuplicate(text) {
  const cleaned = text.trim().toLowerCase();
  return notes.some((note) => note.text.toLowerCase() === cleaned);
}

// 6. Adds a note only if it is 1-200 characters, is not a duplicate and the category is one of personal, work or study. Returns true when added and false otherwise, logging the reason.
function addNote(text, category) {
  const cleaned = text.trim();

  if (cleaned.length === 0 || cleaned.length > 200) {
    console.log("Rejected: a note must be 1-200 characters.");
    return false;
  }
  if (isDuplicate(cleaned)) {
    console.log(`Rejected: "${cleaned}" already exists.`);
    return false;
  }
  if (!CATEGORIES.includes(category)) {
    console.log(`Rejected: "${category}" is not a valid category.`);
    return false;
  }

  notes.push({ id: Date.now(), text: cleaned, category: category });
  console.log(`Added: "${cleaned}" (${category})`);
  return true;
}

// ---------------- Tests ----------------
console.log(searchNotes("revise")); // [ {id: 4, text: "Revise...", ...} ]
console.log(searchNotes("BREAD")); // [ {id: 1, ...} ] - case does not matter
console.log(searchNotes("Christmas")); // [] - no matches

console.log(longestNote().text); // "Email the project report to Grace"

console.log(countByCategory()); // { personal: 2, work: 1, study: 2 }
console.log(getSummary()); // "5 notes: 2 personal, 1 work, 2 study."

console.log(isDuplicate("  call MUM ")); // true
console.log(isDuplicate("Call dad")); // false

console.log(addNote("Visit the library", "study")); // Added ... then true
console.log(addNote("call mum", "personal")); // Rejected: "call mum" already exists (duplicate), false
console.log(addNote("   ", "work")); // Rejected (length) a note must be 1-200 characters, false
console.log(addNote("Plan wellness trip", "staycation")); // Rejected "staycation" is not a valid category, false

console.log(getSummary()); // "6 notes: 2 personal, 1 work, 3 study."
