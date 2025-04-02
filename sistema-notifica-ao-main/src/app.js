const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Configuração do banco de dados
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite.');
        db.run(`CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const port = 3000;

// Configuração do EJS
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Rotas
app.get('/admin', (req, res) => {
    db.all('SELECT content FROM tasks ORDER BY timestamp DESC', [], (err, tasks) => {
        if (err) {
            console.error('Erro ao buscar tarefas:', err.message);
            return res.status(500).send('Erro ao carregar tarefas');
        }
        res.render('admin', {
            tasks: tasks.map(t => t.content),
            error: req.query.error
        });
    });
});

app.post('/submit-task', (req, res) => {
    const newTask = req.body.task.trim();

    db.get('SELECT content FROM tasks WHERE content = ?', [newTask], (err, existingTask) => {
        if (err) {
            console.error('Erro ao verificar tarefa existente:', err.message);
            return res.status(500).send('Erro ao verificar tarefa');
        }

        if (existingTask) {
            io.emit('duplicate-task');
            return res.redirect('/admin?error=' + encodeURIComponent('Tarefa já existe!'));
        }

        db.run('INSERT INTO tasks (content) VALUES (?)', [newTask], function (err) {
            if (err) {
                console.error('Erro ao salvar tarefa:', err.message);
                return res.status(500).send('Erro ao salvar tarefa');
            }

            io.emit('new-task', {
                task: newTask,
                message: 'Nova tarefa cadastrada!'
            });

            res.redirect('/admin');
        });
    });
});



app.post('/delete-task', (req, res) => {
    const taskContent = req.body.task;

    db.run(
        'DELETE FROM tasks WHERE content = ?',
        [taskContent],
        function (err) {
            if (err) {
                console.error('Erro ao deletar tarefa:', err.message);
                return res.status(500).send('Erro ao deletar tarefa');
            }

            io.emit('task-deleted', {
                task: taskContent,
                message: 'Tarefa removida!'
            });

            res.redirect('/admin');
        }
    );
});

app.get('/user', (req, res) => {
    db.all('SELECT content FROM tasks ORDER BY timestamp DESC', [], (err, tasks) => {
        if (err) {
            console.error('Erro ao buscar tarefas:', err.message);
            return res.status(500).send('Erro ao carregar tarefas');
        }
        res.render('user', { tasks: tasks.map(t => t.content) });
    });
});

// Socket.IO
io.on('connection', (socket) => {
    console.log('Um usuário conectou:', socket.id);

    // Envia as tarefas iniciais para o cliente
    db.all('SELECT content FROM tasks ORDER BY timestamp DESC', [], (err, tasks) => {
        if (!err) {
            socket.emit('initial-tasks', tasks.map(t => t.content));
        }
    });

    socket.on('disconnect', () => {
        console.log('Um usuário desconectou:', socket.id);
    });
});

server.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});