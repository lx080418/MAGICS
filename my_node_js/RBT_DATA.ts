// RBT_DATA.ts
import { RedBlackTree, compareString } from "./red_black_tree";

export type VolunteerRecord = {
    fullName: string;
    preferredName: string;
    email: string;
    affiliation: string;
    imageUrl: string;
    role: string;
    createdAt: number;
};

export const volunteerTree = new RedBlackTree<string, VolunteerRecord>(compareString);
