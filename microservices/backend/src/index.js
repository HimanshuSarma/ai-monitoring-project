const express = require('express');
const config = require('./config/env');
const userRoutes = require('./routes/userRoutes');
const logRoutes = require('./routes/logRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(express.json());

app.use('/api/backend', userRoutes);
app.use('/api/backend', logRoutes);

app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`Server listening on port ${config.PORT}`);
});