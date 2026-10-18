# Library API Design

A REST API for a library's **books** resource. Clients send HTTP requests and the server answers with JSON.

## The resource

A book is stored with these fields:

- `id`: a number the server assigns
- `title`: the book's title (required)
- `author`: the author's name (required)
- `isbn`: the book's ISBN (optional)
- `publishedYear`: the year it was published (optional)
- `available`: `true` when the book is on the shelf, `false` when it is borrowed

## Endpoints

| #   | Method   | Path                   | Success status   |
| --- | -------- | ---------------------- | ---------------- |
| 1   | `GET`    | `/books`               | `200 OK`         |
| 2   | `GET`    | `/books/{id}`          | `200 OK`         |
| 3   | `POST`   | `/books`               | `201 Created`    |
| 4   | `PATCH`  | `/books/{id}`          | `200 OK`         |
| 5   | `DELETE` | `/books/{id}`          | `204 No Content` |
| 6   | `GET`    | `/books?author={name}` | `200 OK`         |

### 1. List all books

- **Method:** `GET`
- **Path:** `/books`
- **Description:** Returns every book in the library.
- **Request body:** none (`GET` requests have no body)
- **Success status:** `200 OK`

### 2. Get one book

- **Method:** `GET`
- **Path:** `/books/{id}`, for example `/books/7`
- **Description:** Returns the single book with that id.
- **Request body:** none
- **Success status:** `200 OK`

### 3. Create a book

- **Method:** `POST`
- **Path:** `/books`
- **Description:** Adds a new book to the library. The server assigns the `id`.
- **Request body:**

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "isbn": "9780385474542",
  "publishedYear": 1958
}
```

- **Success status:** `201 Created`, with the new book (including its `id`) in the response body

### 4. Update a book

- **Method:** `PATCH`
- **Path:** `/books/{id}`, for example `/books/7`
- **Description:** Changes only the fields you send, such as marking a book as borrowed.
- **Request body:**

```json
{
  "available": false
}
```

- **Success status:** `200 OK`, with the updated book in the response body

### 5. Delete a book

- **Method:** `DELETE`
- **Path:** `/books/{id}`, for example `/books/7`
- **Description:** Removes the book from the library.
- **Request body:** none
- **Success status:** `204 No Content` (there is nothing to send back)

### 6. List books by an author

- **Method:** `GET`
- **Path:** `/books?author=Chinua%20Achebe`
- **Description:** Returns only the books written by that author. The author is a query parameter, which comes after the `?`.
- **Request body:** none
- **Success status:** `200 OK`, with an array of books (an empty array `[]` if the author has none)

## Example: a book in a response

```json
{
  "id": 7,
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "isbn": "9780385474542",
  "publishedYear": 1958,
  "available": true
}
```

## Error codes

### `400 Bad Request`

- **When it happens:** the request is invalid. For example, someone sends `POST /books` with no `title`, or a `publishedYear` that is text instead of a number.
- **Example response:**

```json
{
  "error": "Bad Request",
  "message": "A book needs a title and an author."
}
```

### `404 Not Found`

- **When it happens:** the book does not exist. For example, someone sends `GET /books/9999` or `DELETE /books/9999` and there is no book with that id.
- **Example response:**

```json
{
  "error": "Not Found",
  "message": "No book with id 9999."
}
```

## Design notes

- The path uses a plural noun, `/books`, and the HTTP method says what to do. There are no verbs in the URLs, so there is no `/getBooks` or `/deleteBook`.
- A single book is addressed by its id: `/books/7`.
- Filtering uses a query parameter on the same path, not a new endpoint.
