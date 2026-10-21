import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;
import com.google.zxing.*;
import com.google.zxing.common.HybridBinarizer;

/** Decode the actual desktop QR for the emulator smoke, without logging credentials. */
class ReadPairingQr {
    public static void main(String[] args) throws Exception {
        var image = ImageIO.read(Path.of(args[0]).toFile());
        int w = image.getWidth(), h = image.getHeight();
        var source = new RGBLuminanceSource(w, h, image.getRGB(0, 0, w, h, null, 0, w));
        var result = new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(source)),
            Map.of(DecodeHintType.POSSIBLE_FORMATS, List.of(BarcodeFormat.QR_CODE)));
        Files.writeString(Path.of(args[1]), result.getText());
    }
}
