import java.util.Scanner;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.io.IOException;
import java.io.File;
import java.io.FileNotFoundException;

// IMPORTANT NOTE
// I used the code from this Medium article as a reference: https://medium.com/@dev.prasenjitsaha/migrate-mongodb-data-to-cloud-firestore-79a68ee18aa3
// The author of this article is Prasenjit Saha
// @author Prasenjit Saha

public class ConvertFormat {
    public static void main(String[] args) {
        Scanner myScanner = null;
        FileWriter myFileWriter = null;
        PrintWriter myPrintWriter = null;

        try {
            // The only arg passed is the file path of exported_data.json
            String filePath = args[0];
            myScanner = new Scanner(new File(filePath));
            String finalJSONArray = "[";

            // We want to go through each line of the file
            while(myScanner.hasNextLine()) {
                // And remove the "_id" field from the string
                String line = myScanner.nextLine();

                // By finding the right substring
                int idKeyLocation = line.indexOf("\"_id\":");
                int commaLocation = line.indexOf(",", idKeyLocation);

                // And removing it
                String modifiedLine = line.substring(0, idKeyLocation) + line.substring(commaLocation+1);

                // Now add this line to the rest of the JSON array that we are building
                finalJSONArray += modifiedLine;
                if(myScanner.hasNextLine()) {
                    finalJSONArray += ",";
                }
            }

            // Close off the JSON with a ']' and now we have a JSON array that matches the
            // format that Cloud Firestore is expecting
            finalJSONArray += "]";
            System.out.println(finalJSONArray);

            try {
                // Put this JSON in a file called fixed_formatting.json
                myFileWriter = new FileWriter("fixed_formatting.json");
                myPrintWriter = new PrintWriter(myFileWriter);
                myPrintWriter.print(finalJSONArray);
            }
            catch(IOException ioe) {
                System.out.println("There was a problem writing to a temporary file created by the program called fixed_formatting.json");
            }
            finally {
                myPrintWriter.close();
            }
        }
        catch(FileNotFoundException fnfe) {
            System.out.println("exported_data.json was not found, this should not happen");
        }
        finally {
            // Close the scanner object
            myScanner.close();
        }
    }
}

// IMPORTANT NOTE
// I used the code from this Medium article as a reference: https://medium.com/@dev.prasenjitsaha/migrate-mongodb-data-to-cloud-firestore-79a68ee18aa3
// The author of this article is Prasenjit Saha
// @author Prasenjit Saha