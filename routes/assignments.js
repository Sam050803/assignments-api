let Assignment = require('../model/assignment');

// Récupérer tous les assignments avec pagination, recherche, filtrage et tri (GET)
function getAssignments(req, res){
    var aggregateQuery = Assignment.aggregate();
    
    // Recherche par nom
    if (req.query.search) {
        aggregateQuery.match({ nom: { $regex: req.query.search, $options: 'i' } });
    }
    
    // Filtrage par statut (rendu)
    if (req.query.rendu !== undefined) {
        const rendu = req.query.rendu === 'true';
        aggregateQuery.match({ rendu: rendu });
    }
    
    // Filtrage par date (dateFilter: 'today', 'week', 'month', 'overdue')
    if (req.query.dateFilter && req.query.dateFilter !== 'all') {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const weekFromNow = new Date(today);
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        const monthFromNow = new Date(today);
        monthFromNow.setMonth(monthFromNow.getMonth() + 1);
        
        switch (req.query.dateFilter) {
            case 'today':
                // Assignments avec dateDeRendu = aujourd'hui
                aggregateQuery.match({
                    dateDeRendu: {
                        $gte: today,
                        $lt: tomorrow
                    }
                });
                break;
                
            case 'week':
                // Assignments dans les 7 prochains jours
                aggregateQuery.match({
                    dateDeRendu: {
                        $gte: today,
                        $lte: weekFromNow
                    }
                });
                break;
                
            case 'month':
                // Assignments dans le mois à venir
                aggregateQuery.match({
                    dateDeRendu: {
                        $gte: today,
                        $lte: monthFromNow
                    }
                });
                break;
                
            case 'overdue':
                // Assignments en retard (non rendus avec date passée)
                aggregateQuery.match({
                    rendu: false,
                    dateDeRendu: { $lt: today }
                });
                break;
        }
    }
    
    // Tri
    const sortField = req.query.sortBy || 'dateDeRendu';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    aggregateQuery.sort({ [sortField]: sortOrder });
    
    Assignment.aggregatePaginate(aggregateQuery,
        {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 10
        },
        (err, assignments) => {
            if(err){
                return res.status(500).send(err);
            }
            res.send(assignments);
        }
    );
}

// Récupérer un assignment par son id (GET)
function getAssignment(req, res){
    let assignmentId = req.params.id;

    Assignment.findOne({id: assignmentId}, (err, assignment) =>{
        if(err){
            return res.status(500).send(err);
        }
        res.json(assignment);
    })
}

// Ajout d'un assignment (POST)
function postAssignment(req, res){
    // Validation des données
    if (!req.body.nom || req.body.nom.trim() === '') {
        return res.status(400).json({ 
            error: 'Le nom de l\'assignment est requis',
            message: 'Le champ "nom" ne peut pas être vide'
        });
    }
    
    if (!req.body.dateDeRendu) {
        return res.status(400).json({ 
            error: 'La date de rendu est requise',
            message: 'Le champ "dateDeRendu" est obligatoire'
        });
    }
    
    const dateDeRendu = new Date(req.body.dateDeRendu);
    if (isNaN(dateDeRendu.getTime())) {
        return res.status(400).json({ 
            error: 'Date invalide',
            message: 'La date de rendu doit être une date valide'
        });
    }
    
    if (req.body.id === undefined || req.body.id === null) {
        return res.status(400).json({ 
            error: 'L\'ID est requis',
            message: 'Le champ "id" est obligatoire'
        });
    }

    let assignment = new Assignment();
    assignment.id = req.body.id;
    assignment.nom = req.body.nom.trim();
    assignment.dateDeRendu = dateDeRendu;
    assignment.rendu = req.body.rendu || false;

    console.log("POST assignment reçu :");
    console.log(assignment)

    assignment.save( (err) => {
        if(err){
            // Gestion des erreurs de validation MongoDB
            if (err.name === 'ValidationError') {
                return res.status(400).json({ 
                    error: 'Erreur de validation',
                    message: err.message
                });
            }
            // Gestion des erreurs de duplication
            if (err.code === 11000) {
                return res.status(409).json({ 
                    error: 'Assignment déjà existant',
                    message: 'Un assignment avec cet ID existe déjà'
                });
            }
            return res.status(500).json({ 
                error: 'Erreur serveur',
                message: 'Impossible de sauvegarder l\'assignment: ' + err.message
            });
        }
        res.status(201).json({ message: `${assignment.nom} saved!`})
    })
}

// Update d'un assignment (PUT)
function updateAssignment(req, res) {
    // Validation des données
    if (!req.body._id) {
        return res.status(400).json({ 
            error: 'ID manquant',
            message: 'Le champ "_id" est requis pour la mise à jour'
        });
    }
    
    if (req.body.nom !== undefined && (!req.body.nom || req.body.nom.trim() === '')) {
        return res.status(400).json({ 
            error: 'Nom invalide',
            message: 'Le nom ne peut pas être vide'
        });
    }
    
    if (req.body.dateDeRendu) {
        const dateDeRendu = new Date(req.body.dateDeRendu);
        if (isNaN(dateDeRendu.getTime())) {
            return res.status(400).json({ 
                error: 'Date invalide',
                message: 'La date de rendu doit être une date valide'
            });
        }
        req.body.dateDeRendu = dateDeRendu;
    }
    
    // Nettoyer le nom si présent
    if (req.body.nom) {
        req.body.nom = req.body.nom.trim();
    }
    
    console.log("UPDATE recu assignment : ");
    console.log(req.body);
    
    Assignment.findByIdAndUpdate(req.body._id, req.body, {new: true, runValidators: true}, (err, assignment) => {
        if (err) {
            console.log(err);
            if (err.name === 'ValidationError') {
                return res.status(400).json({ 
                    error: 'Erreur de validation',
                    message: err.message
                });
            }
            return res.status(500).json({ 
                error: 'Erreur serveur',
                message: 'Impossible de mettre à jour l\'assignment: ' + err.message
            });
        }
        if (!assignment) {
            return res.status(404).json({
                error: 'Assignment non trouvé',
                message: 'Aucun assignment trouvé avec cet ID'
            });
        }
        res.json({message: 'updated', assignment: assignment});
    });
}

// suppression d'un assignment (DELETE)
function deleteAssignment(req, res) {

    Assignment.findByIdAndRemove(req.params.id, (err, assignment) => {
        if (err) {
            return res.status(500).send(err);
        }
        if (!assignment) {
            return res.status(404).json({message: 'Assignment not found'});
        }
        res.json({message: `${assignment.nom} deleted`});
    })
}

// Récupérer les statistiques globales (GET /api/assignments/stats)
function getStats(req, res) {
    Promise.all([
        Assignment.countDocuments({}),
        Assignment.countDocuments({ rendu: true }),
        Assignment.countDocuments({ rendu: false }),
        Assignment.countDocuments({ 
            rendu: false, 
            dateDeRendu: { $lt: new Date() } 
        })
    ])
    .then(([total, rendu, nonRendu, enRetard]) => {
        res.json({
            total: total,
            rendu: rendu,
            nonRendu: nonRendu,
            enRetard: enRetard,
            pourcentageRendu: total > 0 ? Math.round((rendu / total) * 100) : 0
        });
    })
    .catch(err => {
        res.status(500).send(err);
    });
}

// Récupérer les assignments en retard (GET /api/assignments/en-retard)
function getAssignmentsEnRetard(req, res) {
    const aggregateQuery = Assignment.aggregate([
        {
            $match: {
                rendu: false,
                dateDeRendu: { $lt: new Date() }
            }
        },
        {
            $sort: { dateDeRendu: 1 }
        }
    ]);
    
    Assignment.aggregatePaginate(aggregateQuery,
        {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 10
        },
        (err, assignments) => {
            if(err){
                return res.status(500).send(err);
            }
            res.send(assignments);
        }
    );
}

module.exports = { 
    getAssignments, 
    postAssignment, 
    getAssignment, 
    updateAssignment, 
    deleteAssignment,
    getStats,
    getAssignmentsEnRetard
};
