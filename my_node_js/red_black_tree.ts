// red_black_tree.ts
export type Comparator<K> = (a: K, b: K) => number;

export type RBEntry<K, V> = { key: K; value: V };

enum Color {
    BLACK = 0,
    RED = 1,
}

class Node<K, V> {
    key: K | null;
    value: V | null;
    color: Color;
    parent: Node<K, V> | null;
    left: Node<K, V>;
    right: Node<K, V>;

    constructor(
        key: K | null,
        value: V | null,
        color: Color,
        left: Node<K, V>,
        right: Node<K, V>,
        parent: Node<K, V> | null
    ) {
        this.key = key;
        this.value = value;
        this.color = color; // ✅ 修：尊重傳入顏色（Java 版你這裡硬寫 RED 會炸）
        this.left = left;
        this.right = right;
        this.parent = parent;
    }
}

export class RedBlackTree<K, V> implements Iterable<RBEntry<K, V>> {
    private readonly NIL: Node<K, V>;
    private root: Node<K, V>;
    private readonly compare: Comparator<K>;
    public size = 0;

    constructor(compare: Comparator<K>) {
        this.compare = compare;

        // ✅ 統一 NIL 哨兵（全樹不使用 null 當葉子）
        const nil = new Node<K, V>(null, null, Color.BLACK, null as any, null as any, null);
        nil.left = nil;
        nil.right = nil;
        this.NIL = nil;

        this.root = this.NIL;
    }

    // ---------------- Public APIs ----------------

    /** 插入或覆蓋；回傳舊值（若不存在則 undefined） */
    set(key: K, value: V): V | undefined {
        if (key === (null as any)) throw new Error("Null key is not allowed");

        if (this.root === this.NIL) {
            const n = new Node<K, V>(key, value, Color.BLACK, this.NIL, this.NIL, null);
            this.root = n;
            this.size = 1;
            return undefined;
        }

        let cur = this.root;
        let parent: Node<K, V> | null = null;

        while (cur !== this.NIL) {
            parent = cur;
            const c = this.compare(key, cur.key as K);
            if (c < 0) cur = cur.left;
            else if (c > 0) cur = cur.right;
            else {
                const old = cur.value as V;
                cur.value = value;
                return old;
            }
        }

        const z = new Node<K, V>(key, value, Color.RED, this.NIL, this.NIL, parent);
        if (this.compare(key, parent!.key as K) < 0) parent!.left = z;
        else parent!.right = z;

        this.fixAfterInsert(z);
        this.size++;
        return undefined;
    }

    get(key: K): V | undefined {
        const n = this.findNode(key);
        return n === this.NIL ? undefined : (n.value as V);
    }

    has(key: K): boolean {
        return this.findNode(key) !== this.NIL;
    }

    /** 刪除；回傳被刪掉的 value（若不存在則 undefined） */
    delete(key: K): V | undefined {
        const z = this.findNode(key);
        if (z === this.NIL) return undefined;

        const removed = z.value as V;

        let y = z;
        let yOriginalColor = y.color;
        let x: Node<K, V>;

        if (z.left === this.NIL) {
            x = z.right;
            this.transplant(z, z.right);
        } else if (z.right === this.NIL) {
            x = z.left;
            this.transplant(z, z.left);
        } else {
            y = this.minimum(z.right);
            yOriginalColor = y.color;
            x = y.right;

            if (y.parent === z) {
                x.parent = y;
            } else {
                this.transplant(y, y.right);
                y.right = z.right;
                y.right.parent = y;
            }

            this.transplant(z, y);
            y.left = z.left;
            y.left.parent = y;
            y.color = z.color;
        }

        if (yOriginalColor === Color.BLACK) {
            this.fixAfterDelete(x);
        }

        this.size--;
        return removed;
    }

    clear(): void {
        this.root = this.NIL;
        this.size = 0;
    }

    min(): RBEntry<K, V> | undefined {
        if (this.root === this.NIL) return undefined;
        const m = this.minimum(this.root);
        return { key: m.key as K, value: m.value as V };
    }

    max(): RBEntry<K, V> | undefined {
        if (this.root === this.NIL) return undefined;
        const m = this.maximum(this.root);
        return { key: m.key as K, value: m.value as V };
    }

    /** <= key 的最大鍵（floor） */
    floor(key: K): RBEntry<K, V> | undefined {
        let cur = this.root;
        let best: Node<K, V> | null = null;

        while (cur !== this.NIL) {
            const c = this.compare(key, cur.key as K);
            if (c === 0) return { key: cur.key as K, value: cur.value as V };
            if (c < 0) cur = cur.left;
            else {
                best = cur;
                cur = cur.right;
            }
        }
        return best ? { key: best.key as K, value: best.value as V } : undefined;
    }

    /** >= key 的最小鍵（ceil） */
    ceil(key: K): RBEntry<K, V> | undefined {
        let cur = this.root;
        let best: Node<K, V> | null = null;

        while (cur !== this.NIL) {
            const c = this.compare(key, cur.key as K);
            if (c === 0) return { key: cur.key as K, value: cur.value as V };
            if (c > 0) cur = cur.right;
            else {
                best = cur;
                cur = cur.left;
            }
        }
        return best ? { key: best.key as K, value: best.value as V } : undefined;
    }

    successor(key: K): RBEntry<K, V> | undefined {
        const n = this.findNode(key);
        if (n === this.NIL) return undefined;
        const s = this.successorNode(n);
        return s === this.NIL ? undefined : { key: s.key as K, value: s.value as V };
    }

    predecessor(key: K): RBEntry<K, V> | undefined {
        const n = this.findNode(key);
        if (n === this.NIL) return undefined;
        const p = this.predecessorNode(n);
        return p === this.NIL ? undefined : { key: p.key as K, value: p.value as V };
    }

    /** 中序遍歷（排序後） */
    entries(): RBEntry<K, V>[] {
        const out: RBEntry<K, V>[] = [];
        this.inOrder((k, v) => out.push({ key: k, value: v }));
        return out;
    }

    keys(): K[] {
        const out: K[] = [];
        this.inOrder((k) => out.push(k));
        return out;
    }

    values(): V[] {
        const out: V[] = [];
        this.inOrder((_k, v) => out.push(v));
        return out;
    }

    /** 指定範圍查詢：[lo, hi]（含邊界） */
    range(lo: K, hi: K): RBEntry<K, V>[] {
        const out: RBEntry<K, V>[] = [];
        const dfs = (n: Node<K, V>) => {
            if (n === this.NIL) return;
            const cLo = this.compare(n.key as K, lo);
            const cHi = this.compare(n.key as K, hi);

            if (cLo > 0) dfs(n.left);
            if (cLo >= 0 && cHi <= 0) out.push({ key: n.key as K, value: n.value as V });
            if (cHi < 0) dfs(n.right);
        };
        dfs(this.root);
        return out;
    }

    /** forEach（中序） */
    forEach(fn: (value: V, key: K) => void): void {
        this.inOrder((k, v) => fn(v, k));
    }

    /** Iterable：for..of 直接跑 entries（中序） */
    *[Symbol.iterator](): Iterator<RBEntry<K, V>> {
        const stack: Node<K, V>[] = [];
        let cur = this.root;
        while (cur !== this.NIL || stack.length) {
            while (cur !== this.NIL) {
                stack.push(cur);
                cur = cur.left;
            }
            const n = stack.pop()!;
            yield { key: n.key as K, value: n.value as V };
            cur = n.right;
        }
    }

    /** 驗證紅黑樹性質（debug 用） */
    validate(): { ok: true } | { ok: false; reason: string } {
        if (this.root === this.NIL) return { ok: true };
        if (this.root.color !== Color.BLACK) return { ok: false, reason: "Root must be BLACK" };
        if (this.root.parent !== null) return { ok: false, reason: "Root.parent must be null" };

        const blackHeight = this.countBlackHeight(this.root);
        if (blackHeight < 0) return { ok: false, reason: "Black height mismatch" };

        const okNoRedRed = this.checkNoRedRed(this.root);
        if (!okNoRedRed) return { ok: false, reason: "Red node has red child" };

        const okBST = this.checkBST(this.root, null, null);
        if (!okBST) return { ok: false, reason: "BST order violated" };

        return { ok: true };
    }

    // ---------------- Traversals ----------------

    inOrder(fn: (key: K, value: V) => void): void {
        const dfs = (n: Node<K, V>) => {
            if (n === this.NIL) return;
            dfs(n.left);
            fn(n.key as K, n.value as V);
            dfs(n.right);
        };
        dfs(this.root);
    }

    preOrder(fn: (key: K, value: V) => void): void {
        const dfs = (n: Node<K, V>) => {
            if (n === this.NIL) return;
            fn(n.key as K, n.value as V);
            dfs(n.left);
            dfs(n.right);
        };
        dfs(this.root);
    }

    postOrder(fn: (key: K, value: V) => void): void {
        const dfs = (n: Node<K, V>) => {
            if (n === this.NIL) return;
            dfs(n.left);
            dfs(n.right);
            fn(n.key as K, n.value as V);
        };
        dfs(this.root);
    }

    // ---------------- Internals ----------------

    private findNode(key: K): Node<K, V> {
        let cur = this.root;
        while (cur !== this.NIL) {
            const c = this.compare(key, cur.key as K);
            if (c === 0) return cur;
            cur = c < 0 ? cur.left : cur.right;
        }
        return this.NIL;
    }

    private minimum(n: Node<K, V>): Node<K, V> {
        let cur = n;
        while (cur.left !== this.NIL) cur = cur.left;
        return cur;
    }

    private maximum(n: Node<K, V>): Node<K, V> {
        let cur = n;
        while (cur.right !== this.NIL) cur = cur.right;
        return cur;
    }

    private successorNode(n: Node<K, V>): Node<K, V> {
        if (n.right !== this.NIL) return this.minimum(n.right);
        let cur = n;
        let p = n.parent;
        while (p !== null && cur === p.right) {
            cur = p;
            p = p.parent;
        }
        return p ?? this.NIL;
    }

    private predecessorNode(n: Node<K, V>): Node<K, V> {
        if (n.left !== this.NIL) return this.maximum(n.left);
        let cur = n;
        let p = n.parent;
        while (p !== null && cur === p.left) {
            cur = p;
            p = p.parent;
        }
        return p ?? this.NIL;
    }

    private transplant(u: Node<K, V>, v: Node<K, V>): void {
        if (u.parent === null) {
            this.root = v;
        } else if (u === u.parent.left) {
            u.parent.left = v;
        } else {
            u.parent.right = v;
        }
        v.parent = u.parent;
    }

    private rotateLeft(x: Node<K, V>): void {
        const y = x.right;

        x.right = y.left;
        if (y.left !== this.NIL) y.left.parent = x;

        // ✅ 修：應該是 y.parent = x.parent（而不是把 x.parent 改掉）
        y.parent = x.parent;

        if (x.parent === null) this.root = y;
        else if (x === x.parent.left) x.parent.left = y;
        else x.parent.right = y;

        y.left = x;
        x.parent = y;
    }

    private rotateRight(x: Node<K, V>): void {
        const y = x.left;

        x.left = y.right;
        if (y.right !== this.NIL) y.right.parent = x;

        // ✅ 修：應該是 y.parent = x.parent
        y.parent = x.parent;

        if (x.parent === null) this.root = y;
        else if (x === x.parent.right) x.parent.right = y;
        else x.parent.left = y;

        y.right = x;
        x.parent = y;
    }

    private fixAfterInsert(z: Node<K, V>): void {
        let n = z;

        while (n.parent !== null && n.parent.color === Color.RED) {
            const gp = n.parent.parent;
            if (gp === null) break;

            if (n.parent === gp.left) {
                let u = gp.right; // uncle
                if (u.color === Color.RED) {
                    n.parent.color = Color.BLACK;
                    u.color = Color.BLACK;
                    gp.color = Color.RED;
                    n = gp;
                } else {
                    if (n === n.parent.right) {
                        n = n.parent;
                        this.rotateLeft(n);
                    }
                    n.parent!.color = Color.BLACK;
                    gp.color = Color.RED;
                    this.rotateRight(gp);
                }
            } else {
                let u = gp.left;
                if (u.color === Color.RED) {
                    n.parent.color = Color.BLACK;
                    u.color = Color.BLACK;
                    gp.color = Color.RED;
                    n = gp;
                } else {
                    if (n === n.parent.left) {
                        n = n.parent;
                        this.rotateRight(n);
                    }
                    n.parent!.color = Color.BLACK;
                    gp.color = Color.RED;
                    this.rotateLeft(gp);
                }
            }
        }

        this.root.color = Color.BLACK;
        this.root.parent = null;
    }

    private fixAfterDelete(x: Node<K, V>): void {
        let n = x;

        while (n !== this.root && n.color === Color.BLACK) {
            const p = n.parent;
            if (p === null) break;

            if (n === p.left) {
                let s = p.right;

                if (s.color === Color.RED) {
                    s.color = Color.BLACK;
                    p.color = Color.RED;
                    this.rotateLeft(p);
                    s = p.right;
                }

                if (s.left.color === Color.BLACK && s.right.color === Color.BLACK) {
                    s.color = Color.RED;
                    n = p;
                } else {
                    if (s.right.color === Color.BLACK) {
                        s.left.color = Color.BLACK;
                        s.color = Color.RED;
                        this.rotateRight(s);
                        s = p.right;
                    }

                    s.color = p.color;
                    p.color = Color.BLACK;
                    s.right.color = Color.BLACK;
                    this.rotateLeft(p);
                    n = this.root;
                }
            } else {
                let s = p.left;

                if (s.color === Color.RED) {
                    s.color = Color.BLACK;
                    p.color = Color.RED;
                    this.rotateRight(p);
                    s = p.left;
                }

                if (s.left.color === Color.BLACK && s.right.color === Color.BLACK) {
                    s.color = Color.RED;
                    n = p;
                } else {
                    if (s.left.color === Color.BLACK) {
                        s.right.color = Color.BLACK;
                        s.color = Color.RED;
                        this.rotateLeft(s);
                        s = p.left;
                    }

                    s.color = p.color;
                    p.color = Color.BLACK;
                    s.left.color = Color.BLACK;
                    this.rotateRight(p);
                    n = this.root;
                }
            }
        }

        n.color = Color.BLACK;
        this.root.parent = null;
    }

    // ---------------- validate helpers ----------------

    private countBlackHeight(n: Node<K, V>): number {
        // returns blackHeight, or -1 if mismatch
        let left = n.left;
        let right = n.right;

        const lb = left === this.NIL ? 1 : this.countBlackHeight(left);
        if (lb < 0) return -1;

        const rb = right === this.NIL ? 1 : this.countBlackHeight(right);
        if (rb < 0) return -1;

        if (lb !== rb) return -1;

        return lb + (n.color === Color.BLACK ? 1 : 0);
    }

    private checkNoRedRed(n: Node<K, V>): boolean {
        if (n === this.NIL) return true;
        if (n.color === Color.RED) {
            if (n.left.color === Color.RED) return false;
            if (n.right.color === Color.RED) return false;
        }
        return this.checkNoRedRed(n.left) && this.checkNoRedRed(n.right);
    }

    private checkBST(n: Node<K, V>, lo: K | null, hi: K | null): boolean {
        if (n === this.NIL) return true;

        const k = n.key as K;
        if (lo !== null && this.compare(k, lo) <= 0) return false;
        if (hi !== null && this.compare(k, hi) >= 0) return false;

        return this.checkBST(n.left, lo, k) && this.checkBST(n.right, k, hi);
    }
}

// ---------------- Convenience comparators ----------------
export const compareNumber: Comparator<number> = (a, b) => a - b;
export const compareString: Comparator<string> = (a, b) => a.localeCompare(b);
