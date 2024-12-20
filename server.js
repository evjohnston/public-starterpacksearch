import express from 'express';
import cors from 'cors';
import { BskyAgent } from '@atproto/api';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function uriToUrl(uri, handle) {
    if (!uri.startsWith('at://')) return null;
    const parts = uri.replace('at://', '').split('/');
    const rkey = parts[2];
    return `https://bsky.app/starter-pack/${handle}/${rkey}`;
}

app.post('/search', async (req, res) => {
    const { handle, password, searchTerm } = req.body;

    try {
        const agent = new BskyAgent({
            service: 'https://bsky.social'
        });

        await agent.login({
            identifier: handle,
            password: password
        });

        const searchResponse = await agent.api.app.bsky.actor.searchActorsTypeahead({
            term: searchTerm,
            limit: 100
        });

        let allPacksData = [];

        if (searchResponse.data.actors) {
            const actors = searchResponse.data.actors;
            
            for (const actor of actors) {
                try {
                    let cursor = null;
                    do {
                        const packsResponse = await agent.api.app.bsky.graph.getActorStarterPacks({
                            actor: actor.handle,
                            limit: 100,
                            cursor: cursor
                        });

                        if (packsResponse.data.starterPacks) {
                            const packs = packsResponse.data.starterPacks.map(pack => ({
                                name: pack.record?.name || 'No Name',
                                description: pack.record?.description || 'No Description',
                                url: uriToUrl(pack.uri, actor.handle) || 'Invalid URI',
                                owner: actor.handle,
                                itemCount: pack.listItemCount || 0,
                                totalJoins: pack.joinedAllTimeCount || 0
                            }));
                            allPacksData = allPacksData.concat(packs);
                            cursor = packsResponse.data.cursor;
                        } else {
                            cursor = null;
                        }
                    } while (cursor);
                } catch (error) {
                    console.error(`Error fetching packs for ${actor.handle}:`, error);
                }
            }
        }

        res.json(allPacksData);

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});