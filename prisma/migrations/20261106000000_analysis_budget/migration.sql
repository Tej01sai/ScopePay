CREATE TABLE "AnalysisBudget" (
  "id" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL,
  CONSTRAINT "AnalysisBudget_pkey" PRIMARY KEY ("id")
);
