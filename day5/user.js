// ---------- 1. Select the elements we need ----------
const loadBtn = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusText = document.querySelector("#status");
const usersList = document.querySelector("#users-list");

const API_URL = "https://jsonplaceholder.typicode.com/users";

/* 2. The data of every user loaded */
let users = [];

/* 3. create user elements */
function createUserElement(user) {
  const li = document.createElement("li");

  const name = document.createElement("strong");
  name.textContent = user.name; // textContent: safe for any text

  const email = document.createElement("p");
  email.textContent = `Email: ${user.email}`;

  const city = document.createElement("p");
  city.textContent = `City: ${user.address.city}`;

  const company = document.createElement("p");
  company.textContent = `Company: ${user.company.name}`;

  li.appendChild(name);
  li.appendChild(email);
  li.appendChild(city);
  li.appendChild(company);
  return li;
}

/* fetch users stored in an array */
function renderUsers(list) {
  usersList.replaceChildren(); // clear the old list

  if (list.length === 0 && users.length > 0) {
    const empty = document.createElement("li");
    empty.textContent = "No users match your filter.";
    usersList.appendChild(empty);
    return;
  }

  list.forEach((user) => usersList.appendChild(createUserElement(user)));
}

/* 4. Filter the users we already have (no new request) */
function getFilteredUsers() {
  const term = filterInput.value.trim().toLowerCase();
  return users.filter((user) => user.name.toLowerCase().includes(term));
}

/* 5. Load the users from the API */
async function loadUsers() {
  statusText.textContent = "Loading users...";
  loadBtn.disabled = true;
  users = [];
  usersList.replaceChildren();

  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error(`Status ${response.status}`);

    users = await response.json();
    renderUsers(getFilteredUsers());
    statusText.textContent = `Loaded ${users.length} users.`;
  } catch (error) {
    statusText.textContent = "Could not load users. Please try again.";
    console.error(error);
  } finally {
    loadBtn.disabled = false; // runs whether it worked or failed
  }
}

/* 6. Listen for the button and the filter box */
loadBtn.addEventListener("click", loadUsers);
filterInput.addEventListener("input", () => renderUsers(getFilteredUsers()));
