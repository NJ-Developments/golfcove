/**
 * Golf Cove Tournament System
 * Handles tournament creation, management, and data storage
 * Supports leagues with cumulative scoring across multiple rounds
 */

const TournamentManager = {
    // Initialize the system
    init() {
        this.loadCourses();
        this.loadLeagues();
        this.loadTournaments();
        this.setupTabs();
        this.generateParInputs();
    },

    // League Management
    getLeagues() {
        return JSON.parse(localStorage.getItem('golfcove_leagues') || '[]');
    },

    loadLeagues() {
        const leagues = this.getLeagues();
        const leagueSelect = document.getElementById('tournamentLeague');
        const leagueList = document.getElementById('leagueList');

        // Update league dropdown in tournament form
        if (leagueSelect) {
            leagueSelect.innerHTML = '<option value="">Standalone Tournament</option>' +
                leagues.map(l => `<option value="${l.id}">${l.name} (${l.season})</option>`).join('');
        }

        // Update league list in setup tab
        if (leagueList) {
            if (leagues.length === 0) {
                leagueList.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #666;">
                        <i class="fas fa-trophy" style="font-size: 32px; margin-bottom: 15px; color: #ddd;"></i>
                        <p>No leagues created yet. Create a league to track cumulative scores.</p>
                    </div>
                `;
            } else {
                leagueList.innerHTML = leagues.map(league => {
                    const tournaments = this.getTournaments().filter(t => t.leagueId === league.id);
                    return `
                        <div class="tournament-item">
                            <div class="tournament-info">
                                <h4>${league.name}</h4>
                                <p>${league.season} • ${tournaments.length} rounds • ${league.players.length} players</p>
                            </div>
                            <div class="tournament-actions">
                                <a href="leaderboard.html?league=${league.id}" class="btn">Standings</a>
                                <button class="btn btn-secondary" onclick="TournamentManager.viewLeague('${league.id}')">Manage</button>
                                <button class="btn btn-danger" onclick="TournamentManager.deleteLeague('${league.id}')">Delete</button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    },

    saveLeague(event) {
        event.preventDefault();

        const name = document.getElementById('leagueName').value.trim();
        const season = document.getElementById('leagueSeason').value.trim();
        const playersText = document.getElementById('leaguePlayersList').value;

        // Parse players
        const players = playersText.split('\n')
            .map(line => line.trim())
            .filter(line => line)
            .map((line, index) => {
                const parts = line.split(',').map(p => p.trim());
                return {
                    id: 'player_' + Date.now() + '_' + index,
                    name: parts[0] || 'Player ' + (index + 1),
                    handicap: parseInt(parts[1]) || 0
                };
            });

        const league = {
            id: 'league_' + Date.now(),
            name,
            season,
            players,
            createdAt: new Date().toISOString()
        };

        const leagues = this.getLeagues();
        leagues.push(league);
        localStorage.setItem('golfcove_leagues', JSON.stringify(leagues));

        closeModal('createLeague');
        document.getElementById('leagueForm').reset();
        this.loadLeagues();

        alert('League created successfully!');
    },

    viewLeague(leagueId) {
        const leagues = this.getLeagues();
        const league = leagues.find(l => l.id === leagueId);
        if (!league) return;

        const tournaments = this.getTournaments().filter(t => t.leagueId === leagueId);
        const standings = this.calculateLeagueStandings(leagueId);

        const detailsHtml = `
            <h2 style="margin-bottom: 20px;">${league.name}</h2>
            <p style="color: #666; margin-bottom: 30px;">${league.season} • ${tournaments.length} rounds played</p>

            <h3 style="margin-bottom: 15px;">Season Standings</h3>
            <table class="players-table">
                <thead>
                    <tr>
                        <th>Pos</th>
                        <th>Player</th>
                        <th>Rounds</th>
                        <th>Total Gross</th>
                        <th>Total Net</th>
                        <th>Avg</th>
                    </tr>
                </thead>
                <tbody>
                    ${standings.map((p, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${p.name}</td>
                            <td>${p.roundsPlayed}</td>
                            <td>${p.totalGross || '-'}</td>
                            <td>${p.totalNet || '-'}</td>
                            <td>${p.roundsPlayed ? (p.totalGross / p.roundsPlayed).toFixed(1) : '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <h3 style="margin: 30px 0 15px;">Rounds</h3>
            ${tournaments.length === 0 ? '<p style="color: #666;">No rounds added yet.</p>' : 
                tournaments.map(t => `
                    <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>${t.name}</strong>
                            <span style="color: #666; margin-left: 10px;">${new Date(t.date).toLocaleDateString()}</span>
                        </div>
                        <a href="leaderboard.html?t=${t.id}" class="btn btn-secondary">View Scores</a>
                    </div>
                `).join('')
            }

            <div style="margin-top: 30px;">
                <a href="leaderboard.html?league=${leagueId}" class="btn" target="_blank">
                    <i class="fas fa-trophy"></i> Full Standings Page
                </a>
            </div>
        `;

        document.getElementById('tournamentDetails').innerHTML = detailsHtml;
        openModal('viewTournament');
    },

    calculateLeagueStandings(leagueId) {
        const leagues = this.getLeagues();
        const league = leagues.find(l => l.id === leagueId);
        if (!league) return [];

        const tournaments = this.getTournaments().filter(t => t.leagueId === leagueId);
        const allScores = JSON.parse(localStorage.getItem('golfcove_scores') || '{}');

        // Build standings for each player
        const standings = league.players.map(player => {
            let totalGross = 0;
            let totalNet = 0;
            let roundsPlayed = 0;
            const roundScores = [];

            tournaments.forEach(tournament => {
                const tournamentScores = allScores[tournament.id] || {};
                // Find this player in the tournament (might have different ID)
                const tournamentPlayer = tournament.players.find(p => p.name === player.name);
                if (!tournamentPlayer) return;

                const playerScores = tournamentScores[tournamentPlayer.id];
                if (playerScores && playerScores.submitted) {
                    const gross = Object.keys(playerScores)
                        .filter(k => k !== 'submitted' && k !== 'submittedAt')
                        .reduce((sum, h) => sum + (playerScores[h] || 0), 0);
                    const net = gross - (tournamentPlayer.handicap || 0);
                    
                    totalGross += gross;
                    totalNet += net;
                    roundsPlayed++;
                    roundScores.push({ tournamentId: tournament.id, gross, net, date: tournament.date });
                }
            });

            return {
                id: player.id,
                name: player.name,
                handicap: player.handicap,
                totalGross,
                totalNet,
                roundsPlayed,
                roundScores
            };
        });

        // Sort by total net (lower is better)
        standings.sort((a, b) => {
            if (a.roundsPlayed === 0 && b.roundsPlayed === 0) return 0;
            if (a.roundsPlayed === 0) return 1;
            if (b.roundsPlayed === 0) return -1;
            return a.totalNet - b.totalNet;
        });

        return standings;
    },

    deleteLeague(leagueId) {
        if (!confirm('Are you sure you want to delete this league? Tournament data will be preserved.')) return;
        
        let leagues = this.getLeagues();
        leagues = leagues.filter(l => l.id !== leagueId);
        localStorage.setItem('golfcove_leagues', JSON.stringify(leagues));

        // Unlink tournaments from this league
        let tournaments = this.getTournaments();
        tournaments = tournaments.map(t => {
            if (t.leagueId === leagueId) {
                delete t.leagueId;
            }
            return t;
        });
        localStorage.setItem('golfcove_tournaments', JSON.stringify(tournaments));

        this.loadLeagues();
        this.loadTournaments();
    },

    // Tab switching
    setupTabs() {
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active from all tabs
                tabs.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                // Activate clicked tab
                tab.classList.add('active');
                const contentId = tab.dataset.tab;
                document.getElementById(contentId).classList.add('active');
            });
        });
    },

    // Course Management
    loadCourses() {
        const courses = this.getCourses();
        const courseList = document.getElementById('courseList');
        const courseSelect = document.getElementById('tournamentCourse');

        if (courses.length === 0) {
            courseList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #666;">
                    <i class="fas fa-golf-ball" style="font-size: 32px; margin-bottom: 15px; color: #ddd;"></i>
                    <p>No courses added yet. Add a course to get started.</p>
                </div>
            `;
        } else {
            courseList.innerHTML = courses.map(course => `
                <div class="tournament-item">
                    <div class="tournament-info">
                        <h4>${course.name}</h4>
                        <p>${course.holes} holes • Par ${course.pars.reduce((a, b) => a + b, 0)}</p>
                    </div>
                    <div class="tournament-actions">
                        <button class="btn btn-secondary" onclick="TournamentManager.editCourse('${course.id}')">Edit</button>
                        <button class="btn btn-danger" onclick="TournamentManager.deleteCourse('${course.id}')">Delete</button>
                    </div>
                </div>
            `).join('');
        }

        // Update course dropdown
        if (courseSelect) {
            courseSelect.innerHTML = '<option value="">Select a course...</option>' +
                courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }
    },

    getCourses() {
        return JSON.parse(localStorage.getItem('golfcove_courses') || '[]');
    },

    saveCourse(event) {
        event.preventDefault();
        
        const name = document.getElementById('courseName').value.trim();
        const holes = parseInt(document.getElementById('courseHoles').value);
        
        // Collect par values
        const pars = [];
        for (let i = 1; i <= holes; i++) {
            const parInput = document.getElementById('par-' + i);
            pars.push(parseInt(parInput.value) || 4);
        }

        const courses = this.getCourses();
        const course = {
            id: 'course_' + Date.now(),
            name,
            holes,
            pars,
            createdAt: new Date().toISOString()
        };

        courses.push(course);
        localStorage.setItem('golfcove_courses', JSON.stringify(courses));

        closeModal('createCourse');
        document.getElementById('courseForm').reset();
        this.loadCourses();
        this.generateParInputs();

        alert('Course saved successfully!');
    },

    deleteCourse(courseId) {
        if (!confirm('Are you sure you want to delete this course?')) return;
        
        let courses = this.getCourses();
        courses = courses.filter(c => c.id !== courseId);
        localStorage.setItem('golfcove_courses', JSON.stringify(courses));
        this.loadCourses();
    },

    generateParInputs() {
        const holes = parseInt(document.getElementById('courseHoles')?.value || 18);
        const container = document.getElementById('parInputs');
        if (!container) return;

        let html = '';
        for (let i = 1; i <= holes; i++) {
            html += `
                <div style="text-align: center;">
                    <div style="font-size: 11px; color: #666; margin-bottom: 3px;">${i}</div>
                    <input type="number" id="par-${i}" value="4" min="3" max="6" 
                           style="width: 100%; padding: 8px 4px; text-align: center; border: 1px solid #ddd;">
                </div>
            `;
        }
        container.innerHTML = html;
    },

    // Tournament Management
    loadTournaments() {
        const tournaments = this.getTournaments();
        const tournamentList = document.getElementById('tournamentList');
        const activeTournaments = document.getElementById('activeTournaments');

        if (tournaments.length === 0) {
            tournamentList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-trophy"></i>
                    <h3>No tournaments yet</h3>
                    <p>Create your first tournament to get started.</p>
                </div>
            `;
        } else {
            // Sort by date, newest first
            tournaments.sort((a, b) => new Date(b.date) - new Date(a.date));

            tournamentList.innerHTML = tournaments.map(t => {
                const course = this.getCourses().find(c => c.id === t.courseId);
                const dateStr = new Date(t.date).toLocaleDateString('en-US', { 
                    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' 
                });
                const status = this.getTournamentStatus(t);

                return `
                    <div class="tournament-item">
                        <div class="tournament-info">
                            <h4>${t.name} <span class="status-badge status-${status.class}">${status.label}</span></h4>
                            <p>${course ? course.name : 'Unknown Course'} • ${dateStr} • ${t.players.length} players</p>
                        </div>
                        <div class="tournament-actions">
                            <button class="btn" onclick="TournamentManager.viewTournament('${t.id}')">
                                <i class="fas fa-eye"></i> View
                            </button>
                            <a href="leaderboard.html?t=${t.id}" class="btn btn-secondary">
                                <i class="fas fa-trophy"></i> Leaderboard
                            </a>
                            <button class="btn btn-secondary" onclick="TournamentManager.printScorecards('${t.id}')">
                                <i class="fas fa-print"></i> Print
                            </button>
                            <button class="btn btn-danger" onclick="TournamentManager.deleteTournament('${t.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Active tournaments tab
        const active = tournaments.filter(t => this.getTournamentStatus(t).class === 'active');
        if (active.length === 0) {
            activeTournaments.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-golf-ball"></i>
                    <h3>No active tournaments</h3>
                    <p>Active tournaments will appear here when scoring is in progress.</p>
                </div>
            `;
        } else {
            activeTournaments.innerHTML = active.map(t => {
                const course = this.getCourses().find(c => c.id === t.courseId);
                return `
                    <div class="card">
                        <h3>${t.name}</h3>
                        <p style="color: #666; margin-bottom: 20px;">${course ? course.name : 'Unknown Course'}</p>
                        <div style="display: flex; gap: 10px;">
                            <a href="leaderboard.html?t=${t.id}" class="btn">
                                <i class="fas fa-trophy"></i> Live Leaderboard
                            </a>
                            <a href="scoring.html?t=${t.id}" class="btn btn-secondary">
                                <i class="fas fa-mobile-alt"></i> Scoring Page
                            </a>
                        </div>
                    </div>
                `;
            }).join('');
        }
    },

    getTournaments() {
        return JSON.parse(localStorage.getItem('golfcove_tournaments') || '[]');
    },

    getTournamentStatus(tournament) {
        const today = new Date().toDateString();
        const tournamentDate = new Date(tournament.date).toDateString();
        const scores = JSON.parse(localStorage.getItem('golfcove_scores') || '{}');
        const tournamentScores = scores[tournament.id] || {};
        
        const hasScores = Object.keys(tournamentScores).length > 0;
        const allSubmitted = tournament.players.every(p => tournamentScores[p.id]?.submitted);

        if (allSubmitted && hasScores) {
            return { label: 'Completed', class: 'completed' };
        } else if (hasScores || tournamentDate === today) {
            return { label: 'Active', class: 'active' };
        } else if (new Date(tournament.date) > new Date()) {
            return { label: 'Upcoming', class: 'upcoming' };
        } else {
            return { label: 'Past', class: 'completed' };
        }
    },

    saveTournament(event) {
        event.preventDefault();

        const name = document.getElementById('tournamentName').value.trim();
        const date = document.getElementById('tournamentDate').value;
        const teeTime = document.getElementById('teeTime').value;
        const courseId = document.getElementById('tournamentCourse').value;
        const format = document.getElementById('tournamentFormat').value;
        const startingHole = document.getElementById('startingHole').value;
        const leagueId = document.getElementById('tournamentLeague')?.value || '';
        const playersText = document.getElementById('playersList').value;

        // If league is selected, use league players
        let players;
        if (leagueId) {
            const league = this.getLeagues().find(l => l.id === leagueId);
            players = league ? league.players.map(p => ({...p, id: 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)})) : [];
        } else {
            // Parse players from text
            players = playersText.split('\n')
                .map(line => line.trim())
                .filter(line => line)
                .map((line, index) => {
                    const parts = line.split(',').map(p => p.trim());
                    return {
                        id: 'player_' + Date.now() + '_' + index,
                        name: parts[0] || 'Player ' + (index + 1),
                        handicap: parseInt(parts[1]) || 0
                    };
                });
        }

        const tournament = {
            id: 'tournament_' + Date.now(),
            name,
            date,
            teeTime,
            courseId,
            format,
            startingHole: parseInt(startingHole),
            leagueId: leagueId || null,
            players,
            createdAt: new Date().toISOString()
        };

        const tournaments = this.getTournaments();
        tournaments.push(tournament);
        localStorage.setItem('golfcove_tournaments', JSON.stringify(tournaments));

        closeModal('createTournament');
        document.getElementById('tournamentForm').reset();
        this.loadTournaments();

        alert('Tournament created successfully!');
    },

    viewTournament(tournamentId) {
        const tournaments = this.getTournaments();
        const t = tournaments.find(t => t.id === tournamentId);
        if (!t) return;

        const course = this.getCourses().find(c => c.id === t.courseId);
        const scores = JSON.parse(localStorage.getItem('golfcove_scores') || '{}');
        const tournamentScores = scores[tournamentId] || {};

        const detailsHtml = `
            <h2 style="margin-bottom: 20px;">${t.name}</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                <div>
                    <p><strong>Date:</strong> ${new Date(t.date).toLocaleDateString()}</p>
                    <p><strong>Tee Time:</strong> ${t.teeTime || 'TBD'}</p>
                    <p><strong>Format:</strong> ${t.format}</p>
                </div>
                <div>
                    <p><strong>Course:</strong> ${course ? course.name : 'Unknown'}</p>
                    <p><strong>Starting Hole:</strong> ${t.startingHole}</p>
                    <p><strong>Players:</strong> ${t.players.length}</p>
                </div>
            </div>

            <h3 style="margin-bottom: 15px;">Players & Scores</h3>
            <table class="players-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Handicap</th>
                        <th>Gross</th>
                        <th>Net</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${t.players.map(p => {
                        const ps = tournamentScores[p.id] || {};
                        const gross = Object.keys(ps).filter(k => k !== 'submitted' && k !== 'submittedAt').reduce((sum, h) => sum + (ps[h] || 0), 0);
                        const net = gross - (p.handicap || 0);
                        return `
                            <tr>
                                <td>${p.name}</td>
                                <td>${p.handicap || 0}</td>
                                <td>${gross || '-'}</td>
                                <td>${gross ? net : '-'}</td>
                                <td>${ps.submitted ? '✓ Submitted' : gross ? 'In Progress' : 'Not Started'}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>

            <div style="margin-top: 30px; display: flex; gap: 10px; flex-wrap: wrap;">
                <a href="scoring.html?t=${t.id}" class="btn" target="_blank">
                    <i class="fas fa-mobile-alt"></i> Scoring Page
                </a>
                <a href="leaderboard.html?t=${t.id}" class="btn btn-secondary" target="_blank">
                    <i class="fas fa-trophy"></i> Leaderboard
                </a>
                <button class="btn btn-secondary" onclick="TournamentManager.printScorecards('${t.id}')">
                    <i class="fas fa-print"></i> Print Scorecards
                </button>
            </div>
        `;

        document.getElementById('tournamentDetails').innerHTML = detailsHtml;
        openModal('viewTournament');
    },

    deleteTournament(tournamentId) {
        if (!confirm('Are you sure you want to delete this tournament? This will also delete all scores.')) return;

        let tournaments = this.getTournaments();
        tournaments = tournaments.filter(t => t.id !== tournamentId);
        localStorage.setItem('golfcove_tournaments', JSON.stringify(tournaments));

        // Also delete scores
        const scores = JSON.parse(localStorage.getItem('golfcove_scores') || '{}');
        delete scores[tournamentId];
        localStorage.setItem('golfcove_scores', JSON.stringify(scores));

        this.loadTournaments();
    },

    printScorecards(tournamentId) {
        const tournaments = this.getTournaments();
        const t = tournaments.find(t => t.id === tournamentId);
        if (!t) return;

        const course = this.getCourses().find(c => c.id === t.courseId);
        const holes = course ? course.holes : 18;
        const baseUrl = window.location.origin + window.location.pathname.replace('tournament-admin.html', '');

        // Generate printable scorecard
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Scorecards - ${t.name}</title>
                <style>
                    @page { size: landscape; margin: 0.5in; }
                    body { font-family: Arial, sans-serif; }
                    .scorecard { page-break-after: always; padding: 20px; }
                    .scorecard:last-child { page-break-after: auto; }
                    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
                    .logo { font-size: 24px; font-weight: bold; }
                    .qr-section { text-align: center; }
                    .qr-code { width: 100px; height: 100px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; font-size: 10px; }
                    .event-info { text-align: center; margin-bottom: 15px; }
                    .event-name { font-size: 18px; font-weight: bold; }
                    .event-details { font-size: 12px; color: #666; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                    th, td { border: 1px solid #000; padding: 8px; text-align: center; font-size: 12px; }
                    th { background: #f0f0f0; }
                    .player-name { text-align: left; font-weight: bold; }
                    .footer { display: flex; justify-content: space-between; margin-top: 20px; font-size: 12px; }
                    .footer-field { border-bottom: 1px solid #000; min-width: 150px; display: inline-block; }
                </style>
            </head>
            <body>
                ${this.generateScorecardHTML(t, course, baseUrl)}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    },

    generateScorecardHTML(tournament, course, baseUrl) {
        const holes = course ? course.holes : 18;
        const pars = course ? course.pars : Array(holes).fill(4);
        const scoringUrl = `${baseUrl}scoring.html?t=${tournament.id}`;

        // Group players (2 per scorecard for now)
        const groups = [];
        for (let i = 0; i < tournament.players.length; i += 4) {
            groups.push(tournament.players.slice(i, i + 4));
        }

        return groups.map((group, groupIndex) => `
            <div class="scorecard">
                <div class="header">
                    <div class="qr-section">
                        <div class="qr-code">
                            <div>SCAN TO<br>SCORE</div>
                        </div>
                        <div style="font-size: 10px; margin-top: 5px;">LIVE SCORE</div>
                    </div>
                    <div class="event-info">
                        <div class="logo">⛳ GOLF COVE</div>
                        <div class="event-name">${tournament.name}</div>
                        <div class="event-details">
                            ${course ? course.name : 'Course'} — ${new Date(tournament.date).toLocaleDateString()} — 
                            Starting Tee Time: Hole ${tournament.startingHole}
                        </div>
                    </div>
                    <div style="font-size: 12px; text-align: right;">
                        Group ${groupIndex + 1}<br>
                        <span style="font-size: 10px;">${scoringUrl}</span>
                    </div>
                </div>

                <table>
                    <tr>
                        <th>HOLE</th>
                        ${Array.from({length: 9}, (_, i) => `<th>${i + 1}</th>`).join('')}
                        <th>OUT</th>
                        <th></th>
                        ${holes === 18 ? Array.from({length: 9}, (_, i) => `<th>${i + 10}</th>`).join('') : ''}
                        ${holes === 18 ? '<th>IN</th><th>TOT</th>' : ''}
                        <th>HCP</th>
                        <th>NET</th>
                    </tr>
                    ${group.map(player => `
                        <tr>
                            <td class="player-name">${player.name}</td>
                            ${Array.from({length: 9}, () => '<td></td>').join('')}
                            <td></td>
                            <td></td>
                            ${holes === 18 ? Array.from({length: 9}, () => '<td></td>').join('') : ''}
                            ${holes === 18 ? '<td></td><td></td>' : ''}
                            <td>${player.handicap || 0}</td>
                            <td></td>
                        </tr>
                    `).join('')}
                </table>

                <div class="footer">
                    <div>Date: <span class="footer-field">${new Date(tournament.date).toLocaleDateString()}</span></div>
                    <div>Scorer: <span class="footer-field"></span></div>
                    <div>Attest: <span class="footer-field"></span></div>
                </div>
            </div>
        `).join('');
    }
};

// Modal functions
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Global functions for form submissions
function saveTournament(event) {
    TournamentManager.saveTournament(event);
}

function saveCourse(event) {
    TournamentManager.saveCourse(event);
}

function saveLeague(event) {
    TournamentManager.saveLeague(event);
}

function generateParInputs() {
    TournamentManager.generateParInputs();
}

// Toggle players list based on league selection
function togglePlayersForLeague() {
    const leagueSelect = document.getElementById('tournamentLeague');
    const playersSection = document.getElementById('playersSection');
    if (leagueSelect && playersSection) {
        if (leagueSelect.value) {
            playersSection.style.display = 'none';
        } else {
            playersSection.style.display = 'block';
        }
    }
}

// Close modal on outside click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    TournamentManager.init();
});
