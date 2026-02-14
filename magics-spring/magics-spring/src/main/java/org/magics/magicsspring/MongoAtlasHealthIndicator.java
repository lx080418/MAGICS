package org.magics.magicsspring;

import com.mongodb.client.MongoClient;
import org.bson.Document;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;

import org.springframework.stereotype.Component;

@Component("mongoAtlas")
public class MongoAtlasHealthIndicator implements HealthIndicator {

    private final MongoClient client;

    public MongoAtlasHealthIndicator(MongoClient client) {
        this.client = client;
    }

    @Override
    public Health health() {
        try {
            client.getDatabase("magics").runCommand(new Document("ping", 1));
            return Health.up().build();
        } catch (Exception e) {
            return Health.down(e).build();
        }
    }
}

