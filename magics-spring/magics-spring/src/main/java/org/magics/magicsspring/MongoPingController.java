package org.magics.magicsspring;

import com.mongodb.client.MongoCollection;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/mongo")
public class MongoPingController {

    private final MongoTemplate mongoTemplate;

    public MongoPingController(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    // 测试 MongoDB 是否连通
    @GetMapping("/ping")
    public ResponseEntity<?> ping() {
        try {
            Document result = mongoTemplate.getDb().runCommand(new Document("ping", 1));
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new Document("error", e.getMessage()));
        }
    }

    // 查询 volunteers 集合里某个 email 的文档
    @GetMapping("/query")
    public ResponseEntity<?> query() {
        try {
            // 使用配置文件里指定的数据库（推荐）
            MongoCollection<Document> col = mongoTemplate.getDb().getCollection("volunteers");

            Document r = col.find(new Document("email", "mye13@ivc.edu")).first();

            if (r == null) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(new Document("message", "not found"));
            }

            return ResponseEntity.ok(r);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new Document("error", e.getMessage()));
        }
    }
}