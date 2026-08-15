const users = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
  { id: '3', name: 'Charlie' },
];

async function getUserById(req, res) {
  const userId = req.params.id;

  if (userId === '999') {
    const error = new Error(`Database error: User ID ${userId} is restricted or corrupted!`);
    error.statusCode = 500;
    throw error;
  }

  const user = users.find((u) => u.id === userId);

  if (!user) {
    const error = new Error(`User with ID ${userId} not found.`);
    error.statusCode = 404;
    throw error;
  }

  res.json({ success: true, user });
}

module.exports = { getUserById };