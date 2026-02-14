package org.magics.magicsspring;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.bson.Document;

@RestController
public class MongoPingController {
    private final MongoTemplate mongoTemplate;

    public MongoPingController(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @GetMapping("/mongo/ping")
    public Document ping() {
        return mongoTemplate.getDb().runCommand(new Document("ping", 1));
    }
}
