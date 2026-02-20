package org.magics.magicsspring;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.MongoClient;
import org.bson.Document;
import static com.mongodb.client.model.Filters.eq;
import com.mongodb.client.MongoCollection;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MongoQueryController{

    private final MongoClient client;

    public MongoQueryController(MongoClient client) {
        this.client = client;
    }

    @GetMapping("/query")
    public Document query() {
        try {
            MongoDatabase database = client.getDatabase("magics");
            MongoCollection<Document> col = database.getCollection("volunteers");
            Document r = col.find(eq("email", "mye13@ivc.edu")).first();
            return r;
        } catch (Exception e) {
           return new Document();
        }
    }
}
//mye13@ivc.edu