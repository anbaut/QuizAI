# 🎯 Quiz IA Multijoueur

Une application de quiz intelligente et interactive utilisant l'IA locale (LM Studio) avec support multijoueur en temps réel.

## ✨ Fonctionnalités

### 🎮 Mode Solo
- Génération de questions IA personnalisées
- 12 catégories disponibles : Culture générale, Science, Histoire, Géographie, Sport, Cinéma, Musique, Littérature, Technologie, Art, Nature, Cuisine
- 3 niveaux de difficulté : Facile, Moyen, Difficile
- Questions à choix multiples (QCM) pour Facile/Moyen
- Questions ouvertes pour Difficile
- Interface moderne et responsive

### 👥 Mode Multijoueur
- Système de salles avec configuration personnalisée
- Création et gestion de salles de jeu
- Sélection/exclusion de catégories par salle
- Configuration de la difficulté par salle
- Système de scores en temps réel
- Synchronisation des questions entre joueurs
- Classement final à la fin de la partie
- Support jusqu'à 10 joueurs par salle

### 🎨 Interface Améliorée
- Design moderne avec dégradés et animations
- Indicateur de connexion en temps réel
- Thème violet/gradient attrayant
- Responsive design pour mobile et desktop
- Transitions fluides et feedback visuel
- Cartes avec ombres et effets au survol
- Emojis pour une meilleure UX

## 🚀 Installation

### Prérequis
- Node.js (v14 ou supérieur)
- LM Studio avec un modèle LLM installé (pour la génération de questions)

### Backend
```bash
cd backend
npm install
npm start
```

Le serveur démarre sur `http://localhost:3000`

### Frontend
Le frontend est automatiquement servi par le serveur backend.

Accédez simplement à `http://localhost:3000` dans votre navigateur.

## ⚙️ Configuration

### LM Studio
1. Installez LM Studio depuis [https://lmstudio.ai/](https://lmstudio.ai/)
2. Téléchargez un modèle compatible (ex: Mistral 7B Instruct)
3. Démarrez le serveur local dans LM Studio sur le port 1234
4. Vérifiez que le nom du modèle dans `backend/server.js` correspond :
```javascript
const LM_MODEL = "mistral-7b-instruct-v0.3"; // Adapter selon votre modèle
```

### Sans LM Studio
Si LM Studio n'est pas disponible, l'application affiche un message d'erreur clair pour guider l'utilisateur.

## 🎮 Utilisation

### Mode Solo
1. Sélectionnez une catégorie
2. Choisissez la difficulté
3. Cliquez sur "Générer une question"
4. Répondez à la question
5. Cliquez sur "Voir la réponse" pour vérifier

### Mode Multijoueur
1. Entrez votre nom de joueur
2. **Créer une salle** :
   - Donnez un nom à votre salle
   - Sélectionnez la difficulté
   - Choisissez les catégories autorisées (cliquez pour activer/désactiver)
   - Cliquez sur "Créer la salle"
3. **Rejoindre une salle** :
   - Parcourez les salles disponibles
   - Cliquez sur "Rejoindre" pour une salle
4. **Jouer** :
   - L'hôte démarre le jeu avec "Démarrer le jeu"
   - Répondez aux questions le plus rapidement possible
   - Gagnez 10 points par bonne réponse
   - Consultez le classement final

## 🛠️ Architecture Technique

### Backend
- **Express.js** : Serveur HTTP
- **Socket.io** : Communication temps réel pour le multijoueur
- **Node-fetch** : Requêtes vers l'API LM Studio
- **CORS** : Support des requêtes cross-origin

### Frontend
- **HTML5** : Structure sémantique
- **CSS3** : Styles modernes avec animations
- **Vanilla JavaScript** : Logique applicative
- **Socket.io Client** : Communication WebSocket

### Fonctionnalités Socket.io
- `set-player-name` : Définir le nom du joueur
- `create-room` : Créer une nouvelle salle
- `join-room` : Rejoindre une salle
- `leave-room` : Quitter une salle
- `get-rooms` : Obtenir la liste des salles
- `start-game` : Démarrer une partie
- `submit-answer` : Soumettre une réponse
- Events : `room-joined`, `room-updated`, `game-started`, `new-question`, `answer-result`, `game-ended`

## 📝 Structure du Projet

```
QuizAI/
├── backend/
│   ├── server.js          # Serveur Express + Socket.io
│   ├── package.json       # Dépendances backend
│   └── package-lock.json
├── frontend/
│   ├── index.html         # Interface utilisateur
│   ├── script.js          # Logique frontend
│   └── style.css          # Styles CSS
└── README.md             # Documentation
```

## 🎨 Personnalisation

### Modifier les catégories
Éditez les options dans `frontend/index.html` :
```html
<option>Votre nouvelle catégorie</option>
```

Et dans la section de création de salle pour ajouter les checkboxes correspondantes.

### Modifier le nombre de questions par partie
Dans `backend/server.js` :
```javascript
maxQuestions: 5  // Modifier ce nombre
```

### Modifier les points par bonne réponse
Dans `backend/server.js`, fonction `submit-answer` :
```javascript
roomPlayer.score += 10;  // Modifier la valeur
```

## 🐛 Dépannage

### Le serveur ne démarre pas
- Vérifiez que Node.js est installé
- Assurez-vous que le port 3000 est disponible
- Exécutez `npm install` dans le dossier backend

### Les questions ne se génèrent pas
- Vérifiez que LM Studio est démarré
- Confirmez que le serveur LM Studio écoute sur `http://localhost:1234`
- Vérifiez le nom du modèle dans `server.js`
- Consultez les logs du serveur pour les erreurs

### Problèmes de connexion multijoueur
- Vérifiez que Socket.io est correctement installé
- Consultez la console du navigateur pour les erreurs
- Vérifiez l'indicateur de connexion en haut de la page

## 🔒 Sécurité

- Les réponses sont comparées après normalisation (case-insensitive, sans ponctuation)
- Les salles sont automatiquement supprimées quand tous les joueurs partent
- Gestion automatique des déconnexions

## 🚀 Améliorations Futures

- [ ] Système de comptes utilisateur
- [ ] Historique des parties
- [ ] Plus de modes de jeu (contre-la-montre, élimination, etc.)
- [ ] Statistiques détaillées
- [ ] Chat intégré dans les salles
- [ ] Support de plusieurs langues
- [ ] Base de données pour la persistance
- [ ] Classement global

## 📄 Licence

Ce projet est un POC (Proof of Concept) éducatif.

## 👥 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir des issues ou des pull requests.

---

Développé avec ❤️ et l'aide de l'IA
